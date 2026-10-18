/**
 * Journal des jetons dans D1 (table credit_ledger) : une copie des mouvements du portefeuille, que le Durable Object du compte tient et garantit
 * (un seul écrivain : pas de double débit). Le journal sert à l'historique de l'utilisateur et aux rapports ; `reconcile` le compare au Durable Object,
 * rejoue ses opérations pour retrouver le solde, et complète les lignes que D1 n'aurait pas reçues. Une panne de D1 ne bloque jamais un mouvement.
 */
const round = (n) => Math.round(n * 10) / 10

/** Une opération du Durable Object (clé `debit:<job>`, `refund:<job>`, `credit:<paiement>`) → un mouvement avec signe. */
export function movementOf(ref, op) {
  const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)]
  if (!['debit', 'refund', 'credit'].includes(kind)) return null
  return {
    ref, kind, amount: round(kind === 'debit' ? -op.amount : op.amount), at: op.at,
    jobId: kind === 'credit' ? null : id, paymentId: kind === 'credit' ? id : null,
    reason: kind === 'credit' ? (id === 'welcome' ? 'welcome' : id === 'dev-seed' ? 'dev-seed' : 'purchase') : null,
  }
}

/** Toutes les opérations d'un portefeuille, dans l'ordre où elles ont eu lieu, avec le solde après chacune (on part de 0). */
export function replay(ops) {
  let balance = 0
  return Object.entries(ops ?? {}).map(([ref, op]) => movementOf(ref, op)).filter(Boolean)
    .sort((a, b) => a.at - b.at || a.ref.localeCompare(b.ref))
    .map((m) => { balance = round(balance + m.amount); return { ...m, balanceAfter: balance } })
}

/** Enregistre un mouvement ; sans effet s'il l'est déjà. */
export async function recordMovement(db, userId, m) {
  await db.prepare(`INSERT INTO credit_ledger (user_id, kind, reason, amount, balance_after, ref, job_id, payment_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(user_id, ref) DO NOTHING`)
    .bind(userId, m.kind, m.reason ?? null, m.amount, m.balanceAfter, m.ref, m.jobId ?? null, m.paymentId ?? null, m.at ?? Date.now()).run()
}

/** Les mouvements de l'utilisateur, les plus récents d'abord ; `before` (identifiant de la dernière ligne reçue) pour la page suivante. */
export async function listLedger(db, userId, { limit = 30, before = null } = {}) {
  const n = Math.min(Math.max(1, Number(limit) || 30), 100)
  const { results } = await db.prepare('SELECT * FROM credit_ledger WHERE user_id = ?1 AND (?2 IS NULL OR id < ?2) ORDER BY id DESC LIMIT ?3').bind(userId, before, n + 1).all()
  const page = results.slice(0, n).map((r) => ({ id: r.id, kind: r.kind, reason: r.reason, amount: r.amount, balanceAfter: r.balance_after, jobId: r.job_id, paymentId: r.payment_id, createdAt: r.created_at }))
  return { entries: page, next: results.length > n ? page[page.length - 1].id : null }
}

/**
 * Compare le journal D1 aux opérations du Durable Object. `wallet` : { balance, ops } du Durable Object.
 * - manquantes : opérations du Durable Object absentes de D1 → ajoutées (`repair`), avec le solde recalculé ;
 * - divergentes : même clé mais montant différent → signalées, jamais corrigées (le journal ne se modifie pas) ;
 * - en trop : lignes de D1 que le Durable Object ne connaît pas → signalées ;
 * - écart : solde du Durable Object moins somme du journal, nul quand tout concorde.
 */
export async function reconcile(db, userId, wallet, { repair = true } = {}) {
  const expected = replay(wallet.ops)
  const { results } = await db.prepare('SELECT ref, amount FROM credit_ledger WHERE user_id = ?1').bind(userId).all()
  const have = new Map(results.map((r) => [r.ref, r.amount]))
  const missing = expected.filter((m) => !have.has(m.ref))
  const mismatched = expected.filter((m) => have.has(m.ref) && round(have.get(m.ref)) !== m.amount).map((m) => ({ ref: m.ref, expected: m.amount, actual: have.get(m.ref) }))
  const known = new Set(expected.map((m) => m.ref))
  const extra = results.filter((r) => !known.has(r.ref)).map((r) => r.ref)
  if (repair) for (const m of missing) await recordMovement(db, userId, m)
  const sum = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM credit_ledger WHERE user_id = ?1').bind(userId).first()
  const ledgerSum = round(sum?.n ?? 0)
  const drift = round(wallet.balance - ledgerSum)
  return { ok: drift === 0 && mismatched.length === 0 && extra.length === 0, balance: wallet.balance, ledgerSum, drift, missing: missing.map((m) => m.ref), backfilled: repair ? missing.length : 0, mismatched, extra }
}

/**
 * Tâche planifiée : contrôle les utilisateurs actifs ces dernières 26 heures (200 au plus par passage, les plus récents d'abord).
 * Complète les lignes manquantes et journalise toute anomalie (écart, montant divergent, ligne en trop).
 */
export async function reconcileRecent(env, { now = Date.now(), limit = 200 } = {}) {
  const { results } = await env.DB.prepare('SELECT id FROM users WHERE last_seen_at > ?1 ORDER BY last_seen_at DESC LIMIT ?2').bind(now - 26 * 3600_000, limit).all()
  const summary = { users: 0, backfilled: 0, anomalies: 0 }
  for (const u of results) {
    try {
      const wallet = await env.ACCOUNT.get(env.ACCOUNT.idFromName(u.id)).fetch('https://account/ops').then((r) => r.json())
      const r = await reconcile(env.DB, u.id, wallet)
      summary.users++
      summary.backfilled += r.backfilled
      if (!r.ok) { summary.anomalies++; console.error('journal des jetons : anomalie', u.id, JSON.stringify({ drift: r.drift, mismatched: r.mismatched, extra: r.extra })) }
    } catch (e) { console.error('journal des jetons', u.id, e.message) }
  }
  return summary
}
