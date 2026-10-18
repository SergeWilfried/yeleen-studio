/**
 * Copie dans D1 de ce que décide le Durable Object du compte : grand livre des jetons (`ledger`) et recharges (`topups`).
 * Le Durable Object reste seul juge du solde ; D1 sert à l'historique, aux rapports et au rapprochement. Chaque écriture est
 * idempotente (clé primaire, et une recharge plus ancienne n'écrase jamais une plus récente), donc on peut la rejouer sans risque :
 * le Durable Object garde une file d'attente et réessaie tant que D1 n'a pas confirmé.
 */

const SIGN = { debit: -1, refund: 1, credit: 1 }

/** Ligne du grand livre pour une opération du portefeuille (voir wallet.js). */
export const ledgerItem = (kind, ref, amount, balance, at = Date.now()) => ({ t: 'ledger', kind, ref, delta: SIGN[kind] * amount, balance, at })
export const topupItem = (topup) => ({ t: 'topup', topup })

/** Toutes les opérations déjà dans le portefeuille (`ops` : « debit:<job> » → { amount, at }), pour reprendre l'historique. */
export function walletHistory(w) {
  return Object.entries(w.ops).map(([key, op]) => {
    const i = key.indexOf(':')
    return ledgerItem(key.slice(0, i), key.slice(i + 1), op.amount, null, op.at)
  })
}

const LEDGER = 'INSERT INTO ledger (account, kind, ref, delta, balance, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING'
const TOPUP = `INSERT INTO topups (reference, account, pack, amount_fcfa, jetons, country, operator, phone, status, failure, late, paygate_id, created_at, updated_at, completed_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
  ON CONFLICT (reference) DO UPDATE SET status = excluded.status, failure = excluded.failure, late = excluded.late, paygate_id = excluded.paygate_id,
    updated_at = excluded.updated_at, completed_at = excluded.completed_at
  WHERE excluded.updated_at >= topups.updated_at`

/** Écrit un élément de la file dans D1. */
export function write(db, account, item) {
  if (item.t === 'ledger') return db.prepare(LEDGER).bind(account, item.kind, item.ref, item.delta, item.balance ?? null, item.at).run()
  const t = item.topup
  return db.prepare(TOPUP).bind(
    t.reference, account, t.pack, t.amountFcfa, t.jetons, t.country ?? null, t.operator ?? null, t.phone ?? null, t.status, t.failure ?? null,
    t.late ? 1 : 0, t.paygateId ?? null, t.createdAt, t.updatedAt ?? t.createdAt, t.completedAt ?? null,
  ).run()
}

/** Grand livre d'un compte, du plus récent au plus ancien. */
export async function ledgerOf(db, account, { limit = 50, before } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const { results } = before
    ? await db.prepare('SELECT kind, ref, delta, balance, at FROM ledger WHERE account = ?1 AND at < ?2 ORDER BY at DESC LIMIT ?3').bind(account, Number(before), n).all()
    : await db.prepare('SELECT kind, ref, delta, balance, at FROM ledger WHERE account = ?1 ORDER BY at DESC LIMIT ?2').bind(account, n).all()
  return results
}
