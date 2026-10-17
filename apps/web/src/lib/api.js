/**
 * Client de l'API du studio (apps/api). Le navigateur ne parle jamais à fal : tout passe par l'API,
 * qui calcule le prix, débite les jetons, appelle fal et rembourse en cas d'échec.
 * Sans `VITE_API_URL`, `apiEnabled` est faux et l'application reste sur le moteur simulé.
 */
const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
export const apiEnabled = Boolean(BASE)

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`)
    this.status = status
    this.body = body ?? {}
  }
}

async function request(path, init) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init })
  } catch {
    throw new ApiError(0, { error: 'unreachable' }) // API éteinte ou hors réseau
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body)
  return body
}

export const api = {
  wallet: () => request('/wallet'),
  createJob: (spec) => request('/jobs', { method: 'POST', body: JSON.stringify(spec) }),
  job: (id) => request(`/jobs/${id}`),
  cancelJob: (id) => request(`/jobs/${id}/cancel`, { method: 'POST' }),
  /** Dépose un fichier d'entrée (image, audio) chez le fournisseur ; renvoie son adresse. */
  async upload(file) {
    let res
    try {
      res = await fetch(`${BASE}/uploads?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': file.type }, body: file })
    } catch {
      throw new ApiError(0, { error: 'unreachable' })
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, body)
    return body.url
  },
}
