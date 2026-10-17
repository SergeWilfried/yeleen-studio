/**
 * Client minimal de la file fal.ai (REST), sans dépendance : il tourne tel quel dans un Worker.
 * Flux : submit → status (IN_QUEUE, IN_PROGRESS, COMPLETED) → result. Les adresses de suivi viennent de la réponse
 * de submit : on les stocke et on les réutilise, on ne les reconstruit pas (les sous-chemins de point d'accès diffèrent).
 */
const QUEUE = 'https://queue.fal.run'
const STORAGE = 'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3'

export class FalError extends Error {
  constructor(status, body, where) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body)
    super(`fal ${where} ${status}: ${detail.slice(0, 300)}`)
    this.status = status
    this.body = body
    this.where = where
  }
  /** Refus pour contenu (filtre de sécurité de fal) : inutile de réessayer tel quel. */
  get isContentPolicy() {
    const text = JSON.stringify(this.body ?? '').toLowerCase()
    return /content_policy|safety|nsfw|moderat/.test(text)
  }
}

const parse = async (res) => {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

export function falClient({ key, fetch: f = fetch }) {
  if (!key) throw new Error('FAL_KEY manquante')
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }
  const call = async (url, init, where) => {
    const res = await f(url, { ...init, headers })
    const body = await parse(res)
    if (!res.ok) throw new FalError(res.status, body, where)
    return body
  }
  return {
    async submit(endpoint, input, { webhookUrl } = {}) {
      const qs = webhookUrl ? `?fal_webhook=${encodeURIComponent(webhookUrl)}` : ''
      const b = await call(`${QUEUE}/${endpoint}${qs}`, { method: 'POST', body: JSON.stringify(input) }, 'submit')
      return { requestId: b.request_id, statusUrl: b.status_url, responseUrl: b.response_url, cancelUrl: b.cancel_url }
    },
    async status(statusUrl) {
      const b = await call(`${statusUrl}${statusUrl.includes('?') ? '&' : '?'}logs=1`, { method: 'GET' }, 'status')
      return { status: b.status, queuePosition: b.queue_position ?? 0, logs: (b.logs ?? []).map((l) => l.message).filter(Boolean) }
    },
    result(responseUrl) {
      return call(responseUrl, { method: 'GET' }, 'result')
    },
    cancel(cancelUrl) {
      return call(cancelUrl, { method: 'PUT' }, 'cancel')
    },
    /** Dépose un fichier dans le stockage de fal et renvoie son adresse, utilisable comme entrée d'un modèle. */
    async upload(bytes, contentType, fileName) {
      const init = await call(STORAGE, { method: 'POST', body: JSON.stringify({ content_type: contentType, file_name: fileName }) }, 'upload')
      const put = await f(init.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes })
      if (!put.ok) throw new FalError(put.status, await parse(put), 'upload-put')
      return init.file_url
    },
  }
}
