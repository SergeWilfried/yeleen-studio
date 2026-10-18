/**
 * Copie dans D1 de ce que décide le Durable Object du compte : grand livre des jetons (`ledger`), recharges (`topups`),
 * générations (`jobs`) et fichiers générés gardés dans R2 (`assets`).
 * Le Durable Object reste seul juge du solde ; D1 sert à l'historique, aux rapports et au rapprochement. Chaque écriture est
 * idempotente (clé primaire, et une recharge plus ancienne n'écrase jamais une plus récente), donc on peut la rejouer sans risque :
 * le Durable Object garde une file d'attente et réessaie tant que D1 n'a pas confirmé.
 */

const SIGN = { debit: -1, refund: 1, credit: 1 }

/** Ligne du grand livre pour une opération du portefeuille (voir wallet.js). */
export const ledgerItem = (kind, ref, amount, balance, at = Date.now()) => ({ t: 'ledger', kind, ref, delta: SIGN[kind] * amount, balance, at })
export const topupItem = (topup) => ({ t: 'topup', topup })
export const jobItem = (job) => ({ t: 'job', job })

const MEDIA = /^(image|video|audio)\//
/** Une ligne `assets` par sortie copiée dans R2 (les autres n'ont qu'une adresse temporaire chez fal) d'une génération terminée. */
export function assetItems(job) {
  if (job.status !== 'COMPLETED') return []
  const outs = job.outputs ?? []
  const label = (job.prompt ?? '').trim().slice(0, 80) || job.modelId
  return outs.flatMap((o, i) => {
    const kind = MEDIA.exec(o.contentType ?? '')?.[1]
    if (!o.key || !kind) return []
    return [{
      t: 'asset', id: `${job.id}:${i}`, kind, name: outs.length > 1 ? `${label} · ${i + 1}/${outs.length}` : label, key: o.key, contentType: o.contentType,
      width: o.width ?? null, height: o.height ?? null, secs: job.secs ?? null, prompt: job.prompt ?? null, model: job.modelId, jobId: job.id, idx: i,
      at: job.finishedAt ?? Date.now(),
    }]
  })
}

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

// Une génération évolue (en file → terminée) : on met à jour son état, jamais sa demande d'origine (prompt, paramètres, coût).
const JOB = `INSERT INTO jobs (id, user_id, kind, model_id, endpoint, request_id, status, cost, count, prompt, params, failure, refund, outputs, created_at, started_at, finished_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
  ON CONFLICT (id) DO UPDATE SET endpoint = excluded.endpoint, request_id = excluded.request_id, status = excluded.status, failure = excluded.failure,
    refund = excluded.refund, outputs = excluded.outputs, started_at = COALESCE(jobs.started_at, excluded.started_at), finished_at = excluded.finished_at`
const ASSET = `INSERT INTO assets (id, user_id, kind, source, name, r2_key, content_type, width, height, secs, prompt, model, job_id, idx, created_at)
  VALUES (?1, ?2, ?3, 'generated', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) ON CONFLICT DO NOTHING`

const json = (v) => (v == null ? null : JSON.stringify(v))

/** Écrit un élément de la file dans D1. */
export function write(db, account, item) {
  if (item.t === 'ledger') return db.prepare(LEDGER).bind(account, item.kind, item.ref, item.delta, item.balance ?? null, item.at).run()
  if (item.t === 'job') {
    const j = item.job
    return db.prepare(JOB).bind(
      j.id, account, j.kind, j.modelId, j.endpoint ?? null, j.requestId ?? null, j.status, j.cost, j.count ?? 1, j.prompt ?? null, j.params ?? null,
      j.failure ?? null, j.refund ?? 0, json(j.outputs?.map(({ url, key, contentType, width, height }) => ({ url, key, contentType, width, height }))),
      j.createdAt, j.startedAt ?? null, j.finishedAt ?? null,
    ).run()
  }
  if (item.t === 'asset') {
    return db.prepare(ASSET).bind(item.id, account, item.kind, item.name, item.key, item.contentType ?? null, item.width, item.height, item.secs,
      item.prompt, item.model, item.jobId, item.idx, item.at).run()
  }
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
