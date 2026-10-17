import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../src/account-do.js'
import { AuthError, resetAuthCache, verifyClerkToken } from '../src/auth.js'
import app from '../src/index.js'

const ISSUER = 'https://clerk.example.test'
const ORIGIN = 'https://yeleen.example.workers.dev'
const enc = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

/** Une paire de clés RSA de test, son JWKS, et de quoi signer des jetons comme Clerk. */
async function keys(kid = 'k1') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' }
  const sign = async (claims = {}, header = {}) => {
    const now = Math.floor(Date.now() / 1000)
    const body = { iss: ISSUER, sub: 'user_abc123', azp: ORIGIN, iat: now, nbf: now - 1, exp: now + 60, ...claims }
    const head = enc({ alg: 'RS256', typ: 'JWT', kid, ...header })
    const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${enc(body)}`))).toString('base64url')
    return `${head}.${enc(body)}.${sig}`
  }
  return { jwks: { keys: [jwk] }, sign }
}
const jwksFetch = (jwks) => async (url) => (String(url).endsWith('/.well-known/jwks.json') ? Response.json(jwks) : new Response('nope', { status: 404 }))
const opts = (jwks) => ({ issuer: ISSUER, authorizedParties: [ORIGIN], fetch: jwksFetch(jwks) })
const reason = async (p) => p.then(() => 'ok', (e) => (e instanceof AuthError ? e.reason : `other:${e.message}`))

test('un jeton valide donne le compte', async () => {
  resetAuthCache()
  const k = await keys()
  const r = await verifyClerkToken(await k.sign(), opts(k.jwks))
  assert.equal(r.sub, 'user_abc123')
})

test('refus : expiré, pas encore valide, mauvais émetteur, mauvaise origine, mauvaise signature, algorithme, forme', async () => {
  resetAuthCache()
  const k = await keys()
  const other = await keys() // autre paire, même identifiant de clé
  const now = Math.floor(Date.now() / 1000)
  assert.equal(await reason(verifyClerkToken(await k.sign({ exp: now - 120 }), opts(k.jwks))), 'expired')
  assert.equal(await reason(verifyClerkToken(await k.sign({ nbf: now + 120 }), opts(k.jwks))), 'not_yet_valid')
  assert.equal(await reason(verifyClerkToken(await k.sign({ iss: 'https://evil.example' }), opts(k.jwks))), 'bad_issuer')
  assert.equal(await reason(verifyClerkToken(await k.sign({ azp: 'https://evil.example' }), opts(k.jwks))), 'bad_origin')
  assert.equal(await reason(verifyClerkToken(await other.sign(), opts(k.jwks))), 'bad_signature')
  assert.equal(await reason(verifyClerkToken(await k.sign({}, { alg: 'none' }), opts(k.jwks))), 'unsupported_algorithm')
  assert.equal(await reason(verifyClerkToken(await k.sign({}, { alg: 'HS256' }), opts(k.jwks))), 'unsupported_algorithm')
  assert.equal(await reason(verifyClerkToken(await k.sign({ sub: '../etc' }), opts(k.jwks))), 'bad_subject')
  assert.equal(await reason(verifyClerkToken('pas.un.jeton', opts(k.jwks))), 'malformed')
  assert.equal(await reason(verifyClerkToken('', opts(k.jwks))), 'malformed')
  assert.equal(await reason(verifyClerkToken(await k.sign(), { ...opts(k.jwks), issuer: '' })), 'not_configured')
})

test('une clé qui change (rotation) est rechargée une fois', async () => {
  resetAuthCache()
  const a = await keys('ka')
  await verifyClerkToken(await a.sign(), opts(a.jwks))
  const b = await keys('kb') // nouvelle clé publiée depuis
  let calls = 0
  const f = async (url) => { calls++; return jwksFetch({ keys: [...a.jwks.keys, ...b.jwks.keys] })(url) }
  assert.equal((await verifyClerkToken(await b.sign(), { issuer: ISSUER, authorizedParties: [ORIGIN], fetch: f })).sub, 'user_abc123')
  assert.equal(calls, 1)
})

// ── L'API entière, avec authentification ─────────────────────────────────────

function setup(vars = {}, jwks) {
  const store = new Map()
  const accounts = new Map()
  const env = {
    FAL_KEY: 'test', ENV: 'production', CLERK_ISSUER: ISSUER, ALLOWED_ORIGINS: ORIGIN, ...vars,
    ACCOUNT: {
      idFromName: (n) => n,
      get: (name) => {
        if (!accounts.has(name)) {
          const m = new Map(); store.set(name, m)
          accounts.set(name, new Account({ storage: { get: async (k) => structuredClone(m.get(k)), put: async (k, v) => { m.set(k, structuredClone(v)) } } }, { ENV: 'dev' }))
        }
        return { fetch: (url, init) => accounts.get(name).fetch(new Request(url, init)) }
      },
    },
  }
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/.well-known/jwks.json')) return Response.json(jwks)
    if (String(url).endsWith('/nano-banana-pro')) return Response.json({ request_id: 'r1', status_url: 'https://queue.fal.run/x/requests/r1/status', response_url: 'https://queue.fal.run/x/requests/r1', cancel_url: 'https://queue.fal.run/x/requests/r1/cancel' })
    return Response.json({ status: 'IN_QUEUE', queue_position: 1 })
  }
  resetAuthCache()
  return { req: (path, init) => app.fetch(new Request(`http://api${path}`, init), env), restore: () => { globalThis.fetch = real } }
}
const withToken = (token, init = {}) => ({ ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } })
const image = { kind: 'image', modelId: 'nano-banana-pro', prompt: 'un chat', resolution: '1K', count: 1 }
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('API : sans jeton, refus ; /health et la préparation CORS restent ouverts', async () => {
  const k = await keys()
  const t = setup({}, k.jwks)
  try {
    assert.equal((await t.req('/health')).status, 200)
    for (const path of ['/wallet', '/jobs/x']) assert.equal((await t.req(path)).status, 401)
    assert.equal((await t.req('/jobs', post(image))).status, 401)
    assert.equal((await t.req('/uploads?name=a.png', { method: 'POST', headers: { 'content-type': 'image/png' }, body: 'x' })).status, 401)
    const pre = await t.req('/wallet', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } })
    assert.ok(pre.status < 300)
    assert.match(pre.headers.get('access-control-allow-headers') ?? '', /authorization/i)
    assert.equal((await t.req('/wallet', withToken('n.importe.quoi'))).status, 401)
  } finally { t.restore() }
})

test('API : en production sans CLERK_ISSUER, tout est refusé (jamais de compte par défaut)', async () => {
  const t = setup({ CLERK_ISSUER: '' }, { keys: [] })
  try {
    const res = await t.req('/wallet')
    assert.equal(res.status, 503)
    assert.equal((await res.json()).error, 'auth_not_configured')
    assert.equal((await t.req('/health')).status, 200)
  } finally { t.restore() }
})

test('API : chaque utilisateur a son portefeuille et ses générations', async () => {
  const k = await keys()
  const t = setup({ ENV: 'dev' }, k.jwks) // ENV=dev offre des jetons de test ; CLERK_ISSUER défini : la garde reste active
  try {
    const alice = await k.sign({ sub: 'user_alice' })
    const bob = await k.sign({ sub: 'user_bob' })
    const start = (await (await t.req('/wallet', withToken(alice))).json()).balance
    assert.ok(start > 0)
    const job = await t.req('/jobs', withToken(alice, post(image)))
    assert.equal(job.status, 202)
    const { jobId } = await job.json()
    assert.ok((await (await t.req('/wallet', withToken(alice))).json()).balance < start) // Alice a payé
    assert.equal((await (await t.req('/wallet', withToken(bob))).json()).balance, start) // Bob n'a rien perdu
    assert.equal((await t.req(`/jobs/${jobId}`, withToken(alice))).status, 200)
    assert.equal((await t.req(`/jobs/${jobId}`, withToken(bob))).status, 404) // Bob ne voit pas la génération d'Alice
    assert.equal((await t.req(`/jobs/${jobId}/cancel`, withToken(bob, { method: 'POST' }))).status, 404)
  } finally { t.restore() }
})
