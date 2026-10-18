import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../src/account-do.js'
import app from '../src/index.js'
import { ledgerItem, topupItem, write } from '../src/mirror.js'
import { signBody } from '../src/paygate.js'
import { resetUserCache } from '../src/users.js'
import { testD1 } from './d1.js'

beforeEach(() => resetUserCache())

/** L'API entière avec le vrai Account (stockage en mémoire), une vraie base D1 (SQLite) et de faux fal et paygate. */
function setup({ db = testD1(), store = new Map() } = {}) {
  const storage = { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)) } }
  const account = new Account({ storage }, { ENV: 'dev', DB: db })
  const env = {
    ENV: 'dev', FAL_KEY: 'test', DB: db, ALLOWED_ORIGINS: 'http://localhost:5174', PAYGATE_URL: 'https://paygate.test', PAYGATE_KEY: 'pgk', PAYGATE_WEBHOOK_SECRET: 'whsec',
    ACCOUNT: { idFromName: (n) => n, get: () => ({ fetch: (url, init) => account.fetch(new Request(url, init)) }) },
  }
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(init.body) : undefined
    if (u.includes('/v1/collections')) return Response.json({ id: 'pg1', reference: body.reference, status: 'processing', amount: body.amount, currency: 'XOF', method: { authType: 'PROVIDER_AUTH' }, metadata: body.metadata }, { status: 201 })
    if (u.endsWith('/nano-banana-pro')) return Response.json({ request_id: 'r1', status_url: 'https://q/s', response_url: 'https://q/r', cancel_url: 'https://q/c' })
    return Response.json({ detail: 'boom' }, { status: 500 })
  }
  const json = async (path, init) => { const res = await app.fetch(new Request(`http://api${path}`, init), env); return { status: res.status, body: await res.json() } }
  return { db, store, json, rows: (sql) => db.raw.prepare(sql).all(), restore: () => { globalThis.fetch = real } }
}
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const image = { kind: 'image', modelId: 'nano-banana-pro', prompt: 'un chat', resolution: '1K', count: 1 }

async function completeTopup(t, reference) {
  const raw = JSON.stringify({ id: 'evt1', type: 'payment.completed', late: false, data: { id: 'pg1', reference, status: 'completed', amount: 5000, currency: 'XOF', metadata: { account: 'demo' } } })
  return t.json('/webhooks/payments', { method: 'POST', headers: { 'paygate-signature': await signBody('whsec', raw, Math.floor(Date.now() / 1000)) }, body: raw })
}

test('chaque mouvement de jetons arrive dans le grand livre avec son solde ; GET /ledger le rend', async () => {
  const t = setup()
  try {
    const sub = await t.json('/jobs', post(image)) // débit
    assert.equal(sub.status, 202)
    const cancel = await t.json(`/jobs/${sub.body.jobId}/cancel`, { method: 'POST' }) // remboursement
    assert.equal(cancel.body.status, 'CANCELED')
    const top = await t.json('/topups', post({ pack: 'createur', country: 'BF', operator: 'moov', phone: '70123456' }))
    await completeTopup(t, top.body.topup.reference) // crédit
    const lines = t.rows('SELECT kind, ref, delta, balance FROM ledger ORDER BY at, kind')
    assert.deepEqual(lines.map((l) => l.kind).sort(), ['credit', 'credit', 'debit', 'refund']) // dev-seed, recharge, débit, remboursement
    const debit = lines.find((l) => l.kind === 'debit')
    assert.equal(debit.ref, sub.body.jobId)
    assert.ok(debit.delta < 0)
    assert.equal(lines.find((l) => l.ref === top.body.topup.reference).delta, 160)
    assert.equal(lines.find((l) => l.ref === top.body.topup.reference).balance, 400)
    assert.equal(t.rows('SELECT status FROM topups')[0].status, 'completed')
    const api = await t.json('/ledger')
    assert.equal(api.body.entries.length, 4)
    assert.equal(api.body.entries[0].ref, top.body.topup.reference) // le plus récent d'abord
    // Un webhook rejoué ne crée ni ligne ni crédit de plus.
    await completeTopup(t, top.body.topup.reference)
    assert.equal(t.rows('SELECT * FROM ledger').length, 4)
  } finally { t.restore() }
})

test('D1 en panne : les requêtes réussissent, la file attend, puis tout est écrit au retour de D1', async () => {
  const t = setup()
  try {
    await t.json('/wallet') // premier passage : le compte et l'historique sont copiés
    t.db.failing = true
    const sub = await t.json('/jobs', post(image))
    assert.equal(sub.status, 202) // la génération part quand même
    assert.equal(t.store.get('outbox').length, 2) // le débit et la génération
    assert.equal(t.rows('SELECT * FROM ledger WHERE kind = \'debit\'').length, 0)
    t.db.failing = false
    await t.json(`/jobs/${sub.body.jobId}/cancel`, { method: 'POST' })
    assert.deepEqual(t.rows('SELECT kind FROM ledger ORDER BY kind').map((r) => r.kind), ['credit', 'debit', 'refund'])
    assert.equal(t.store.get('outbox').length, 0)
  } finally { t.restore() }
})

test('compte existant avant D1 : son historique est repris une seule fois, sans doublon', async () => {
  const store = new Map()
  const before = setup({ db: null, store }) // sans D1 : rien n'est copié
  try {
    await before.json('/jobs', post(image))
    assert.equal(store.get('outbox'), undefined)
  } finally { before.restore() }
  const t = setup({ store })
  try {
    await t.json('/jobs', post({ ...image, prompt: 'un chien' }))
    const lines = t.rows('SELECT kind, balance FROM ledger')
    assert.equal(lines.length, 3) // dev-seed, ancien débit (sans solde), nouveau débit (avec solde)
    assert.equal(lines.filter((l) => l.balance === null).length, 2)
    await t.json('/wallet')
    assert.equal(t.rows('SELECT * FROM ledger').length, 3)
  } finally { t.restore() }
})

test('recharges : une copie plus ancienne n’écrase jamais une plus récente', async () => {
  const db = testD1()
  const topup = { reference: 'yl_1', pack: 'createur', amountFcfa: 5000, jetons: 160, status: 'completed', createdAt: 1, updatedAt: 20, completedAt: 20 }
  await write(db, 'user_a', topupItem(topup))
  await write(db, 'user_a', topupItem({ ...topup, status: 'processing', updatedAt: 10, completedAt: null }))
  assert.equal(db.raw.prepare('SELECT status FROM topups').get().status, 'completed')
  await write(db, 'user_a', ledgerItem('debit', 'job1', 2.5, 7.5, 5))
  await write(db, 'user_a', ledgerItem('debit', 'job1', 2.5, 7.5, 5))
  assert.deepEqual({ ...db.raw.prepare('SELECT delta, balance FROM ledger').get() }, { delta: -2.5, balance: 7.5 })
})
