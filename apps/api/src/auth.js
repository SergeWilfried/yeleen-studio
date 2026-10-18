/**
 * Authentification Clerk : vérifie le jeton de session (JWT RS256) envoyé par le site, sans dépendance (WebCrypto).
 * L'identité du compte est le champ `sub` du jeton (« user_… ») : un compte = un portefeuille et ses générations.
 *
 * Contrôles : signature (clés publiques de l'émetteur, mises en cache), émetteur, expiration, début de validité, et origine
 * autorisée (`azp`) quand le jeton en porte une. Tout refus lève une AuthError ; l'appelant répond 401.
 */
export class AuthError extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const json = (s) => JSON.parse(new TextDecoder().decode(b64(s)))
const SKEW = 5 // secondes de tolérance entre les horloges

const JWKS_TTL = 10 * 60_000
const cache = new Map() // url → { at, keys: Map(kid → CryptoKey) }

/** Clés publiques de l'émetteur ; une clé inconnue déclenche un seul rechargement (rotation des clés). */
async function keyFor(issuer, kid, { fetch: f = fetch, now = Date.now() } = {}) {
  const url = `${issuer}/.well-known/jwks.json`
  let entry = cache.get(url)
  // Adresse injoignable, page qui n'est pas du JSON (CLERK_ISSUER mal réglé), clé illisible : tout devient `jwks_unavailable` (503),
  // journalisé avec l'adresse essayée, jamais une erreur 500 muette.
  const load = async () => {
    const map = new Map()
    try {
      const res = await f(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { keys = [] } = await res.json()
      for (const jwk of keys) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue
        map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']))
      }
    } catch (e) {
      console.error(`clés Clerk illisibles (${url}) :`, e.message)
      throw new AuthError('jwks_unavailable')
    }
    entry = { at: now, keys: map }
    cache.set(url, entry)
  }
  if (!entry || now - entry.at > JWKS_TTL) await load()
  if (!entry.keys.has(kid)) await load()
  return entry.keys.get(kid) ?? null
}

/** Vérifie un jeton et retourne { sub, claims }. `authorizedParties` : origines du site (ALLOWED_ORIGINS). */
export async function verifyClerkToken(token, { issuer, authorizedParties = [], fetch, now = Date.now() }) {
  if (!issuer) throw new AuthError('not_configured')
  const iss = issuer.replace(/\/+$/, '')
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3) throw new AuthError('malformed')
  let header
  let claims
  try { header = json(parts[0]); claims = json(parts[1]) } catch { throw new AuthError('malformed') }
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError('unsupported_algorithm') // jamais « none » ni HS256

  const key = await keyFor(iss, header.kid, { fetch, now })
  if (!key) throw new AuthError('unknown_key')
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!valid) throw new AuthError('bad_signature')

  const t = Math.floor(now / 1000)
  if (claims.iss?.replace(/\/+$/, '') !== iss) throw new AuthError('bad_issuer')
  if (typeof claims.exp !== 'number' || claims.exp + SKEW < t) throw new AuthError('expired')
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW > t) throw new AuthError('not_yet_valid')
  if (claims.azp && authorizedParties.length && !authorizedParties.includes(claims.azp)) throw new AuthError('bad_origin')
  if (typeof claims.sub !== 'string' || !/^[\w-]{3,100}$/.test(claims.sub)) throw new AuthError('bad_subject')
  return { sub: claims.sub, claims }
}

/** Efface les clés en cache (tests). */
export const resetAuthCache = () => cache.clear()
