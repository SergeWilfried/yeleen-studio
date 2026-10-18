/**
 * Client minimal de paygate (notre passerelle de paiement), sans dépendance : il tourne tel quel dans un Worker.
 * Les montants sont des FCFA entiers (XOF). Voir paygate/docs/api.md.
 */
export class PaygateError extends Error {
  constructor(status, body, where) {
    const code = body?.error?.code
    super(`paygate ${where} ${status}: ${code ?? JSON.stringify(body ?? '').slice(0, 200)}`)
    this.status = status
    this.code = code ?? (status >= 500 ? 'provider' : 'invalid_request')
    this.detail = body?.error ?? {}
  }
}

const parse = async (res) => {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

export function paygateClient({ url, key, fetch: f = fetch }) {
  if (!url || !key) throw new Error('PAYGATE_URL ou PAYGATE_KEY manquante')
  const base = url.replace(/\/+$/, '')
  const call = async (path, init, where) => {
    const res = await f(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } })
    const body = await parse(res)
    if (!res.ok) throw new PaygateError(res.status, body, where)
    return body
  }
  return {
    /** Ce moyen de paiement marche-t-il pour ce numéro ? Limites, `authType` et consignes à montrer. */
    methods({ operator, phone, amount }) {
      const qs = new URLSearchParams({ rail: 'mobile_money', direction: 'collect', operator, phone, ...(amount ? { amount: String(amount) } : {}) })
      return call(`/v1/methods?${qs}`, { method: 'GET' }, 'methods')
    },
    /** Crée et lance l'encaissement. Même `reference` et mêmes détails → le même paiement (sans risque à rejouer). */
    collect(body) {
      return call('/v1/collections', { method: 'POST', body: JSON.stringify(body) }, 'collect')
    },
    collection(reference) {
      return call(`/v1/collections/${encodeURIComponent(reference)}`, { method: 'GET' }, 'collection')
    },
  }
}

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** Comparaison en temps constant. */
function safeEqual(a, b) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

/**
 * En-tête `Paygate-Signature: t=<secondes>,v1=<hex>` : HMAC-SHA256 de `<t>.<corps brut>` avec le secret du webhook.
 * Refusé si `t` a plus de 5 minutes (rejeu). Même règle que paygate/src/signing.ts.
 */
export async function verifySignature(secret, body, header, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  const m = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec((header ?? '').trim())
  if (!m) return false
  if (Math.abs(nowSeconds - Number(m[1])) > toleranceSeconds) return false
  return safeEqual(m[2], await hmacHex(secret, `${m[1]}.${body}`))
}

export const signBody = async (secret, body, t) => `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`
