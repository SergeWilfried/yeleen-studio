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

// Fournisseur du jeton de session Clerk (installé par lib/auth.jsx) ; absent en développement sans Clerk.
let tokenGetter = null
export const setTokenGetter = (fn) => { tokenGetter = fn }
async function authHeader() {
  if (!tokenGetter) return {}
  try {
    const token = await tokenGetter()
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch { return {} } // jeton introuvable : l'API répondra 401 et l'interface invitera à se reconnecter
}

async function request(path, init) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json', ...(await authHeader()) }, ...init })
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
  /** Recharges Mobile Money : moyen disponible pour ce numéro, lancement (ou nouvel essai avec `reference` et `preAuthCode`), suivi, historique. */
  topupOptions: (q) => request(`/topups/options?${new URLSearchParams(q)}`),
  createTopup: (spec) => request('/topups', { method: 'POST', body: JSON.stringify(spec) }),
  topup: (reference) => request(`/topups/${encodeURIComponent(reference)}`),
  topups: () => request('/topups'),
  /** Dépose un fichier d'entrée (image, audio) chez le fournisseur ; renvoie son adresse. */
  async upload(file) {
    let res
    try {
      res = await fetch(`${BASE}/uploads?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': file.type, ...(await authHeader()) }, body: file })
    } catch {
      throw new ApiError(0, { error: 'unreachable' })
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, body)
    return body.url
  },
}
