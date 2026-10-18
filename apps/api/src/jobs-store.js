/**
 * Historique des générations dans D1 : une copie de ce que tient le Durable Object du compte, qui reste l'autorité (argent, état en cours).
 * Écrit à la création puis à chaque changement d'état ; un échec de D1 est journalisé par l'appelant et n'arrête jamais une génération.
 */
const PARAM_KEYS = ['resolution', 'ratio', 'secs', 'fps', 'task', 'sound', 'count', 'language', 'voice', 'title']

/** Texte à retenir d'une demande : le prompt, les plans d'une vidéo (« / »), ou les textes d'un workflow. 2 000 caractères au plus. */
export function promptOf(req) {
  const text = req.kind === 'video' ? (req.plans ?? []).map((p) => p.text).join(' / ')
    : req.kind === 'workflow' ? Object.values(req.inputs ?? {}).filter((v) => typeof v === 'string').join(' / ')
    : req.prompt ?? ''
  return String(text).trim().slice(0, 2000)
}

/** Réglages utiles à l'historique (jamais de fichier ni d'adresse) : quelques champs simples seulement. */
export function paramsOf(req, extra = {}) {
  const out = {}
  for (const k of PARAM_KEYS) { const v = { ...req, ...extra }[k]; if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v }
  if (Array.isArray(req.plans)) out.plans = req.plans.map((p) => p.dur).filter((d) => typeof d === 'number')
  return out
}

const json = (v) => (v == null ? null : JSON.stringify(v))

export async function mirrorJob(db, userId, job) {
  await db.prepare(`INSERT INTO jobs (id, user_id, kind, model_id, endpoint, request_id, status, cost, count, prompt, params, failure, refund, outputs, created_at, started_at, finished_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, failure = excluded.failure, refund = excluded.refund, outputs = COALESCE(excluded.outputs, jobs.outputs),
      started_at = COALESCE(excluded.started_at, jobs.started_at), finished_at = excluded.finished_at`)
    .bind(job.id, userId, job.kind, job.modelId, job.endpoint ?? null, job.requestId ?? null, job.status, job.cost, job.count ?? 1, job.prompt ?? null, json(job.params),
      job.failure ?? null, job.refund ?? 0, json(job.outputs), job.createdAt, job.startedAt ?? null, job.finishedAt ?? null).run()
}

const parse = (s) => { try { return s ? JSON.parse(s) : null } catch { return null } }

/** Les générations de l'utilisateur, les plus récentes d'abord ; `before` (date de création) pour la page suivante. */
export async function listJobs(db, userId, { limit = 30, before = null } = {}) {
  const n = Math.min(Math.max(1, Number(limit) || 30), 100)
  const { results } = await db.prepare('SELECT * FROM jobs WHERE user_id = ?1 AND (?2 IS NULL OR created_at < ?2) ORDER BY created_at DESC LIMIT ?3').bind(userId, before, n + 1).all()
  const page = results.slice(0, n).map((r) => ({
    id: r.id, kind: r.kind, modelId: r.model_id, status: r.status, cost: r.cost, count: r.count, prompt: r.prompt, params: parse(r.params),
    failure: r.failure, refund: r.refund, outputs: parse(r.outputs), createdAt: r.created_at, finishedAt: r.finished_at,
  }))
  return { jobs: page, next: results.length > n ? page[page.length - 1].createdAt : null }
}
