import { Account } from '../src/account-do.js'
import { resetAuthCache } from '../src/auth.js'
import app from '../src/index.js'
import { resetUserCache } from '../src/users.js'
import { testD1 } from './d1.js'

export const ISSUER = 'https://clerk.example.test'
export const ORIGIN = 'https://yeleen.example.workers.dev'
const enc = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

/** Une paire de clés RSA de test, son JWKS, et de quoi signer des jetons de session comme Clerk. */
export async function keys(kid = 'k1') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' }
  const sign = async (claims = {}) => {
    const now = Math.floor(Date.now() / 1000)
    const head = enc({ alg: 'RS256', typ: 'JWT', kid })
    const body = enc({ iss: ISSUER, sub: 'user_abc123', azp: ORIGIN, iat: now, nbf: now - 1, exp: now + 300, ...claims })
    const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`))).toString('base64url')
    return `${head}.${body}.${sig}`
  }
  return { jwks: { keys: [jwk] }, sign }
}

/** Un faux bucket R2 en mémoire (put, get avec plage, delete). */
export function fakeR2() {
  const files = new Map()
  return {
    files,
    async put(key, body, opts = {}) {
      const bytes = body instanceof ArrayBuffer || ArrayBuffer.isView(body) ? new Uint8Array(body.buffer ?? body) : new Uint8Array(await new Response(body).arrayBuffer())
      files.set(key, { bytes, httpMetadata: opts.httpMetadata ?? {} })
    },
    async get(key) {
      const f = files.get(key)
      return f ? { body: new Response(f.bytes).body, httpMetadata: f.httpMetadata, size: f.bytes.length, etag: 'e' } : null
    },
    async delete(key) { files.delete(key) },
  }
}

const queued = { request_id: 'r1', status_url: 'https://queue.fal.run/x/requests/r1/status', response_url: 'https://queue.fal.run/x/requests/r1', cancel_url: 'https://queue.fal.run/x/requests/r1/cancel' }
export const image = { kind: 'image', modelId: 'nano-banana-pro', prompt: 'un chat sur un toit', resolution: '1K', count: 1 }
export const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
export const withToken = (token, init = {}) => ({ ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } })
export const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])

/**
 * L'API entière : vrai code, comptes (Durable Objects en mémoire), D1 (SQLite avec les vraies migrations), R2 simulé, et un faux fal
 * (`phase.v` = 'queue' ou 'done'). Authentification Clerk active (jetons signés avec `k`), ENV=dev pour le solde de départ.
 */
export async function makeApi(vars = {}) {
  resetAuthCache(); resetUserCache()
  const k = await keys()
  const db = testD1()
  const bucket = fakeR2()
  const phase = { v: 'queue' }
  const accounts = new Map()
  const env = {
    FAL_KEY: 'test', ENV: 'dev', CLERK_ISSUER: ISSUER, ALLOWED_ORIGINS: ORIGIN, DB: db, FILES: bucket, ...vars,
    ACCOUNT: {
      idFromName: (n) => n,
      get: (name) => {
        if (!accounts.has(name)) { const m = new Map(); accounts.set(name, new Account({ storage: { get: async (key) => structuredClone(m.get(key)), put: async (key, v) => { m.set(key, structuredClone(v)) } } }, { ENV: 'dev' })) }
        return { fetch: (url, init) => accounts.get(name).fetch(new Request(url, init)) }
      },
    },
  }
  if (vars.DB === null) delete env.DB
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.endsWith('/.well-known/jwks.json')) return Response.json(k.jwks)
    if (u.endsWith('/nano-banana-pro')) return Response.json(queued)
    if (u.includes('/status')) return Response.json({ status: phase.v === 'done' ? 'COMPLETED' : 'IN_QUEUE', queue_position: 1 })
    if (u.includes('/requests/')) return Response.json({ images: [{ url: 'https://v3.fal.media/files/out.png', content_type: 'image/png', width: 1024, height: 1024 }] })
    if (u === 'https://v3.fal.media/files/out.png') return new Response(PNG, { headers: { 'content-type': 'image/png' } })
    return new Response('nope', { status: 404 })
  }
  const req = (path, init) => app.fetch(new Request(`http://api${path}`, init), env)
  const as = async (sub) => { const token = await k.sign({ sub }); return (path, init = {}) => req(path, withToken(token, init)) }
  return { req, as, db, bucket, phase, env, restore: () => { globalThis.fetch = real } }
}
