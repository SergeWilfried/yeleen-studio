import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../src/account-do.js'
import app from '../src/index.js'
import { signBody, verifySignature } from '../src/paygate.js'
import { applyPayment, newReference } from '../src/topups.js'

const SECRET = 'whsec_test'
const PAYGATE = 'https://paygate.test'

/** L'API entière, avec le vrai Account (stockage en mémoire) et un faux paygate. */
function setup(paygate, vars = {}) {
  const store = new Map()
  const storage = { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)) } }
  const account = new Account({ storage }, { ENV: 'dev' })
  const env = {
    ENV: 'dev', ALLOWED_ORIGINS: 'http://localhost:5174,https://studio.example', PAYGATE_URL: PAYGATE, PAYGATE_KEY: 'pgk_test', PAYGATE_WEBHOOK_SECRET: SECRET, ...vars,
    ACCOUNT: { idFromName: (n) => n, get: () => ({ fetch: (url, init) => account.fetch(new Request(url, init)) }) },
  }
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url))
    const body = init?.body ? JSON.parse(init.body) : undefined
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: init?.headers?.Authorization })
    const r = paygate(u.pathname, body, u)
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }
  const req = (path, init) => app.fetch(new Request(`http://api${path}`, init), env)
  const json = async (path, init) => { const res = await req(path, init); return { status: res.status, body: await res.json() } }
  return { req, json, calls, restore: () => { globalThis.fetch = real } }
}
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const order = { pack: 'createur', country: 'BF', operator: 'moov', phone: '70 12 34 56' }

const payment = (body, extra = {}) => ({
  id: 'pg123', object: 'collection', reference: body.reference, rail: 'mobile_money', status: 'processing', amount: body.amount, currency: 'XOF',
  operator: body.operator, counterparty: body.phone, authUrl: null, qr: null, method: { authType: 'PROVIDER_AUTH', instructions: { fr: ['Validez sur votre téléphone'] }, codeInstructions: null },
  failure: null, metadata: body.metadata, createdAt: 1, expiresAt: 2, settledAt: null, ...extra,
})
const okPaygate = (path, body) => (path === '/v1/collections' ? { status: 201, body: payment(body) } : { status: 404, body: { error: { code: 'not_found' } } })

async function webhook(t, event, { secret = SECRET, at = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(event)
  return t.json('/webhooks/payments', { method: 'POST', headers: { 'paygate-signature': await signBody(secret, raw, at) }, body: raw })
}
const event = (type, data, extra = {}) => ({ id: `evt_${data.id}_${type}`, type, createdAt: Date.now(), previousStatus: 'processing', late: false, data, ...extra })

test('signature : bonne, fausse, périmée', async () => {
  const body = '{"a":1}'
  const now = 1_800_000_000
  assert.equal(await verifySignature(SECRET, body, await signBody(SECRET, body, now), now), true)
  assert.equal(await verifySignature(SECRET, body, await signBody('autre', body, now), now), false)
  assert.equal(await verifySignature(SECRET, '{"a":2}', await signBody(SECRET, body, now), now), false)
  assert.equal(await verifySignature(SECRET, body, await signBody(SECRET, body, now - 301), now), false)
  assert.equal(await verifySignature(SECRET, body, null, now), false)
})

test('webhook mal signé ou périmé : 401, rien n’est crédité', async () => {
  const t = setup(okPaygate)
  try {
    const { body } = await t.json('/topups', post(order))
    const done = event('payment.completed', payment({ ...body.topup, amount: 5000 }, { status: 'completed' }))
    assert.equal((await webhook(t, done, { secret: 'whsec_faux' })).status, 401)
    assert.equal((await webhook(t, done, { at: Math.floor(Date.now() / 1000) - 600 })).status, 401)
    assert.equal((await t.json('/wallet')).body.balance, 240)
  } finally { t.restore() }
})

test('le prix vient du catalogue : le montant envoyé par le client est ignoré', async () => {
  const t = setup(okPaygate)
  try {
    const { status, body } = await t.json('/topups', post({ ...order, amount: 1, jetons: 99999 }))
    assert.equal(status, 201)
    const sent = t.calls.find((c) => c.path === '/v1/collections').body
    assert.equal(sent.amount, 5000)
    assert.equal(sent.phone, '+22670123456')
    assert.equal(sent.metadata.account, 'demo')
    assert.match(sent.reference, /^yl_[0-9A-Z]{26}$/)
    assert.equal(body.topup.jetons, 160)
    assert.equal(body.topup.status, 'processing')
    assert.equal(t.calls[0].auth, 'Bearer pgk_test')
    assert.equal((await t.json('/topups', post({ ...order, pack: 'gratuit' }))).body.error, 'unknown_pack')
    assert.equal((await t.json('/topups', post({ ...order, operator: 'wave' }))).body.error, 'invalid_operator') // pas de Wave au Burkina
    assert.equal((await t.json('/topups', post({ ...order, phone: '123' }))).body.error, 'invalid_phone')
  } finally { t.restore() }
})

test('le même payment.completed reçu deux fois ne crédite qu’une fois', async () => {
  const t = setup(okPaygate)
  try {
    const { body } = await t.json('/topups', post(order))
    const sent = t.calls.find((c) => c.path === '/v1/collections').body
    const done = event('payment.completed', payment(sent, { status: 'completed' }))
    assert.equal((await webhook(t, done)).status, 200)
    assert.equal((await webhook(t, done)).status, 200)
    assert.equal((await t.json('/wallet')).body.balance, 240 + 160)
    const after = await t.json(`/topups/${body.topup.reference}`)
    assert.equal(after.body.topup.status, 'completed')
    // Un échec arrivé après coup (ordre non garanti) ne défait pas un paiement abouti.
    await webhook(t, event('payment.failed', payment(sent, { status: 'failed', failure: 'Refusé' })))
    assert.equal((await t.json(`/topups/${body.topup.reference}`)).body.topup.status, 'completed')
  } finally { t.restore() }
})

test('montant différent : rien n’est crédité', async () => {
  const t = setup(okPaygate)
  try {
    await t.json('/topups', post(order))
    const sent = t.calls.find((c) => c.path === '/v1/collections').body
    assert.equal((await webhook(t, event('payment.completed', payment(sent, { status: 'completed', amount: 100 })))).status, 200)
    assert.equal((await t.json('/wallet')).body.balance, 240)
  } finally { t.restore() }
})

test('paiement tardif après expiration : crédité et marqué en retard', async () => {
  const t = setup(okPaygate)
  try {
    const { body } = await t.json('/topups', post(order))
    const sent = t.calls.find((c) => c.path === '/v1/collections').body
    await webhook(t, event('payment.expired', payment(sent, { status: 'expired' })))
    assert.equal((await t.json(`/topups/${body.topup.reference}`)).body.topup.status, 'expired')
    await webhook(t, event('payment.completed', payment(sent, { status: 'completed' }), { late: true, previousStatus: 'expired' }))
    const after = await t.json(`/topups/${body.topup.reference}`)
    assert.equal(after.body.topup.status, 'completed')
    assert.equal(after.body.topup.late, true)
    assert.equal(after.body.balance, 400)
  } finally { t.restore() }
})

test('Orange Burkina : 422 pre_auth_code_required, puis nouvel essai avec la même référence et le code', async () => {
  const codeInstructions = { fr: ['Composez *144*4*6*5000# pour obtenir un code'], en: ['Dial…'] }
  const t = setup((path, body) => {
    if (path !== '/v1/collections') return { status: 404, body: {} }
    if (!body.preAuthCode) return { status: 422, body: { error: { code: 'pre_auth_code_required', message: '…', codeInstructions } } }
    return { status: 201, body: payment(body, { method: { authType: 'PREAUTH', instructions: null, codeInstructions } }) }
  })
  try {
    const orange = { ...order, operator: 'orange' }
    const first = await t.json('/topups', post(orange))
    assert.equal(first.status, 200)
    assert.equal(first.body.topup.status, 'awaiting_code')
    assert.deepEqual(first.body.topup.codeInstructions, codeInstructions)
    const ref = first.body.topup.reference
    assert.equal((await t.json('/topups', post({ ...orange, reference: ref, preAuthCode: '12;34' }))).body.error, 'invalid_pre_auth_code')
    assert.equal((await t.json('/topups', post({ ...orange, pack: 'studio', reference: ref, preAuthCode: '123456' }))).status, 409) // le pack est figé
    const second = await t.json('/topups', post({ ...orange, reference: ref, preAuthCode: '123456' }))
    assert.equal(second.status, 201)
    assert.equal(second.body.topup.reference, ref)
    assert.equal(second.body.topup.status, 'processing')
    const sent = t.calls.filter((c) => c.path === '/v1/collections')
    assert.equal(sent.length, 2)
    assert.equal(sent[1].body.reference, ref)
    assert.equal(sent[1].body.preAuthCode, '123456')
    // Une recharge lancée ne se relance pas avec la même référence.
    assert.equal((await t.json('/topups', post({ ...orange, reference: ref, preAuthCode: '654321' }))).status, 409)
  } finally { t.restore() }
})

test('webhook en retard : la lecture chez paygate crédite (une seule fois)', async () => {
  let status = 'processing'
  let reads = 0
  const t = setup((path, body, u) => {
    if (path === '/v1/collections') return { status: 201, body: payment(body) }
    reads++
    const ref = decodeURIComponent(u.pathname.split('/').pop())
    return { body: payment({ reference: ref, amount: 5000, operator: 'moov', phone: '+22670123456' }, { status }) }
  })
  const realNow = Date.now
  try {
    const { body } = await t.json('/topups', post(order))
    const ref = body.topup.reference
    assert.equal((await t.json(`/topups/${ref}`)).body.topup.status, 'processing')
    assert.equal(reads, 0) // trop tôt : on attend le webhook
    let now = realNow() + 40_000
    Date.now = () => now
    status = 'completed'
    const a = await t.json(`/topups/${ref}`)
    assert.equal(a.body.topup.status, 'completed')
    assert.equal(a.body.balance, 400)
    await webhook(t, event('payment.completed', payment({ reference: ref, amount: 5000, operator: 'moov', phone: '+22670123456' }, { status: 'completed' })), { at: Math.floor(now / 1000) })
    assert.equal((await t.json('/wallet')).body.balance, 400)
    assert.equal(reads, 1)
  } finally { Date.now = realNow; t.restore() }
})

test('erreurs paygate : limites renvoyées, panne gardée en attente, trop de recharges ouvertes', async () => {
  let mode = 'bounds'
  const t = setup((path, body) => {
    if (mode === 'bounds') return { status: 422, body: { error: { code: 'amount_out_of_bounds', min: 100, max: 2000 } } }
    if (mode === 'down') return { status: 503, body: { error: { code: 'internal' } } }
    return { status: 201, body: payment(body) }
  })
  try {
    const a = await t.json('/topups', post(order))
    assert.equal(a.status, 422)
    assert.deepEqual([a.body.error, a.body.max, a.body.topup.status], ['amount_out_of_bounds', 2000, 'failed'])
    mode = 'down'
    const b = await t.json('/topups', post(order))
    assert.equal(b.status, 502)
    assert.equal(b.body.topup.status, 'pending')
    mode = 'ok'
    const retry = await t.json('/topups', post({ ...order, reference: b.body.topup.reference }))
    assert.equal(retry.status, 201)
    assert.equal((await t.json('/topups', post(order))).status, 201)
    assert.equal((await t.json('/topups', post(order))).status, 201)
    const d = await t.json('/topups', post(order))
    assert.equal(d.status, 429)
    assert.equal(d.body.error, 'too_many_open')
    assert.equal((await t.json('/topups')).body.topups.length, 4)
  } finally { t.restore() }
})

test('options : interroge paygate avec le numéro normalisé et le prix du pack', async () => {
  const t = setup((path, _b, u) => ({ body: { rail: 'mobile_money', direction: 'collect', available: true, authType: 'PREAUTH', min: 100, max: 1_000_000, instructions: null, codeInstructions: { fr: ['…'] }, seen: Object.fromEntries(u.searchParams) } }))
  try {
    const { status, body } = await t.json('/topups/options?country=BF&operator=orange&phone=70123456&pack=studio')
    assert.equal(status, 200)
    assert.equal(body.authType, 'PREAUTH')
    assert.deepEqual(t.calls[0].query, { rail: 'mobile_money', direction: 'collect', operator: 'orange', phone: '+22670123456', amount: '20000' })
    assert.equal((await t.json('/topups/options?country=SN&operator=orange&phone=770000000')).body.error, 'unsupported_country') // seul BF par défaut
  } finally { t.restore() }
})

test('ping et types inconnus : 200 et ignorés ; sans configuration : 503', async () => {
  const t = setup(okPaygate)
  try {
    const ping = await webhook(t, { id: 'evt_ping', type: 'ping', data: {} })
    assert.deepEqual([ping.status, ping.body.ignored], [200, 'ping'])
    assert.equal((await webhook(t, { id: 'evt_x', type: 'payment.unknown', data: {} })).status, 200)
  } finally { t.restore() }
  const off = setup(okPaygate, { PAYGATE_KEY: '', PAYGATE_WEBHOOK_SECRET: '' })
  try {
    assert.equal((await off.json('/topups', post(order))).status, 503)
    assert.equal((await webhook(off, { id: 'e', type: 'ping', data: {} })).status, 503)
  } finally { off.restore() }
})

test('applyPayment et newReference', () => {
  const ref = newReference()
  assert.match(ref, /^yl_[0-9A-Z]{26}$/)
  assert.ok(newReference(1) < newReference(2)) // triées par date
  const t = { reference: ref, amountFcfa: 1000, jetons: 30, status: 'processing' }
  assert.equal(applyPayment(t, { reference: ref, status: 'completed', amount: 1000, currency: 'XOF' }).credit, 30)
  assert.equal(applyPayment(t, { reference: 'autre', status: 'completed', amount: 1000 }).credit, 0)
  assert.equal(applyPayment({ ...t, status: 'completed' }, { reference: ref, status: 'completed', amount: 1000 }).credit, 0)
  assert.equal(applyPayment(t, { reference: ref, status: 'completed', amount: 1000, currency: 'EUR' }).mismatch, true)
})
