import { test } from 'node:test'
import assert from 'node:assert/strict'
import app from '../src/index.js'
import { movementOf, reconcile, recordMovement, replay } from '../src/ledger.js'
import { image, makeApi, post } from './harness.js'

const json = (r) => r.json()
const rows = (t, user) => t.db.raw.prepare('SELECT kind, reason, amount, balance_after, ref FROM credit_ledger WHERE user_id = ? ORDER BY id').all(user).map((r) => ({ ...r }))
const balanceOf = async (api) => (await json(await api('/wallet'))).balance

test('replay : les opérations du Durable Object redonnent les mouvements et le solde, dans l’ordre', () => {
  const ops = { 'credit:dev-seed': { amount: 240, at: 100 }, 'debit:j1': { amount: 45.7, at: 200 }, 'refund:j1': { amount: 45.7, at: 300 }, 'debit:j2': { amount: 10, at: 400 }, 'credit:welcome': { amount: 5, at: 350 } }
  const r = replay(ops)
  assert.deepEqual(r.map((m) => [m.ref, m.amount, m.balanceAfter]), [['credit:dev-seed', 240, 240], ['debit:j1', -45.7, 194.3], ['refund:j1', 45.7, 240], ['credit:welcome', 5, 245], ['debit:j2', -10, 235]])
  assert.equal(r[3].reason, 'welcome')
  assert.equal(r[0].reason, 'dev-seed')
  assert.equal(movementOf('debit:j1', { amount: 3, at: 1 }).jobId, 'j1')
  assert.equal(movementOf('credit:wave-123', { amount: 3, at: 1 }).reason, 'purchase')
  assert.equal(movementOf('inconnu:x', { amount: 3, at: 1 }), null)
})

test('un mouvement n’entre qu’une fois dans le journal', async () => {
  const t = await makeApi()
  try {
    const m = { ref: 'debit:j1', kind: 'debit', amount: -5, balanceAfter: 95, jobId: 'j1', at: 1 }
    await recordMovement(t.db, 'user_a', m)
    await recordMovement(t.db, 'user_a', { ...m, amount: -999 }) // même clé : ignoré, jamais modifié
    await recordMovement(t.db, 'user_b', m) // un autre utilisateur a ses propres lignes
    assert.deepEqual(rows(t, 'user_a').map((r) => r.amount), [-5])
    assert.equal(rows(t, 'user_b').length, 1)
  } finally { t.restore() }
})

test('débit, remboursement à l’annulation et crédit de bienvenue sont copiés, avec le solde après chacun', async () => {
  const t = await makeApi({ WELCOME_JETONS: '5' })
  try {
    const alice = await t.as('user_alice')
    const start = await balanceOf(alice) // 240 de départ (ENV=dev) + 5 de bienvenue
    assert.equal(start, 245)
    const { jobId, cost } = await json(await alice('/jobs', post(image)))
    const afterDebit = await balanceOf(alice)
    assert.equal(afterDebit, Math.round((start - cost) * 10) / 10)
    const cancel = await json(await alice(`/jobs/${jobId}/cancel`, { method: 'POST' }))
    assert.equal(cancel.refund, cost) // annulée en file : remboursée en entier
    const log = rows(t, 'user_alice')
    assert.deepEqual(log.map((r) => [r.kind, r.reason, r.amount, r.ref]), [
      ['credit', 'welcome', 5, 'credit:welcome'], ['debit', null, -cost, `debit:${jobId}`], ['refund', null, cost, `refund:${jobId}`],
    ])
    assert.equal(log[1].balance_after, afterDebit)
    assert.equal(log[2].balance_after, start)
    await alice(`/jobs/${jobId}/cancel`, { method: 'POST' }) // rejoué : aucune ligne de plus
    assert.equal(rows(t, 'user_alice').length, 3)
  } finally { t.restore() }
})

test('un envoi refusé par fal et une génération sans sortie sont débités puis remboursés dans le journal', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    t.phase.submit = 'fail'
    const refused = await alice('/jobs', post(image))
    assert.equal(refused.status, 502)
    t.phase.submit = 'ok'
    const { jobId } = await json(await alice('/jobs', post({ ...image, prompt: 'autre chat' })))
    t.phase.v = 'done'
    t.phase.empty = true
    assert.equal((await json(await alice(`/jobs/${jobId}`))).status, 'FAILED')
    const kinds = rows(t, 'user_alice').map((r) => r.kind)
    assert.deepEqual(kinds, ['debit', 'refund', 'debit', 'refund']) // chaque débit a son remboursement
    const sum = Math.round(rows(t, 'user_alice').reduce((n, r) => n + r.amount, 0) * 10) / 10
    assert.equal(sum, 0) // rien n'a été dépensé
  } finally { t.restore() }
})

test('une demande rejouée (même clé) ne laisse qu’un seul débit dans le journal', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    await alice('/jobs', post({ ...image, requestId: 'req-ledger-0001' }))
    await alice('/jobs', post({ ...image, requestId: 'req-ledger-0001' }))
    assert.equal(rows(t, 'user_alice').filter((r) => r.kind === 'debit').length, 1)
  } finally { t.restore() }
})

test('mon historique : les plus récents d’abord, par pages, et chacun voit le sien', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const bob = await t.as('user_bob')
    for (let i = 0; i < 3; i++) await alice('/jobs', post({ ...image, prompt: `chat ${i}`, requestId: `req-hist-000${i}` }))
    const p1 = await json(await alice('/me/ledger?limit=2'))
    assert.equal(p1.entries.length, 2)
    assert.ok(p1.entries.every((e) => e.kind === 'debit' && e.amount < 0))
    assert.ok(p1.entries[0].createdAt >= p1.entries[1].createdAt)
    assert.ok(p1.next)
    const p2 = await json(await alice(`/me/ledger?limit=2&before=${p1.next}`))
    assert.equal(p2.entries.length, 1)
    assert.equal(p2.next, null)
    assert.deepEqual((await json(await bob('/me/ledger'))).entries, [])
    assert.equal((await t.req('/me/ledger')).status, 401)
  } finally { t.restore() }
})

test('contrôle : le journal concorde avec le Durable Object (le crédit de départ, fait dans le Durable Object, est complété)', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    await alice('/jobs', post(image))
    const first = await json(await alice('/me/ledger/audit'))
    assert.deepEqual(first.missing, ['credit:dev-seed']) // le crédit de départ n'a pas été copié à l'époque
    assert.equal(first.backfilled, 1)
    assert.equal(first.ok, true)
    assert.equal(first.drift, 0)
    assert.equal(first.ledgerSum, first.balance)
    const second = await json(await alice('/me/ledger/audit'))
    assert.deepEqual(second.missing, [])
    assert.equal(second.backfilled, 0)
    assert.equal(second.ok, true)
    const log = rows(t, 'user_alice')
    assert.equal(log.find((r) => r.ref === 'credit:dev-seed').balance_after, 240) // solde recalculé en rejouant
  } finally { t.restore() }
})

test('panne de D1 pendant un débit : la génération part, le journal se complète au contrôle suivant', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    await balanceOf(alice) // l'utilisateur existe déjà
    t.db.failing = true
    const res = await alice('/jobs', post(image))
    assert.equal(res.status, 202) // D1 en panne n'empêche ni la génération ni le débit
    const { jobId, cost } = await json(res)
    t.db.failing = false
    assert.equal(rows(t, 'user_alice').filter((r) => r.kind === 'debit').length, 0) // la copie a été manquée
    const audit = await json(await alice('/me/ledger/audit'))
    assert.ok(audit.missing.includes(`debit:${jobId}`))
    assert.equal(audit.ok, true)
    assert.equal(rows(t, 'user_alice').find((r) => r.ref === `debit:${jobId}`).amount, -cost)
    assert.equal(audit.drift, 0)
  } finally { t.restore() }
})

test('contrôle : un montant modifié ou une ligne en trop sont signalés, jamais corrigés en silence', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const { jobId } = await json(await alice('/jobs', post(image)))
    await alice('/me/ledger/audit') // complète le crédit de départ
    t.db.raw.prepare('UPDATE credit_ledger SET amount = -1 WHERE ref = ?').run(`debit:${jobId}`)
    t.db.raw.prepare("INSERT INTO credit_ledger (user_id, kind, amount, balance_after, ref, created_at) VALUES ('user_alice', 'credit', 50, 0, 'credit:fantome', 1)").run()
    const audit = await json(await alice('/me/ledger/audit'))
    assert.equal(audit.ok, false)
    assert.equal(audit.mismatched[0].ref, `debit:${jobId}`)
    assert.equal(audit.mismatched[0].actual, -1)
    assert.deepEqual(audit.extra, ['credit:fantome'])
    assert.notEqual(audit.drift, 0)
    assert.equal(t.db.raw.prepare('SELECT amount FROM credit_ledger WHERE ref = ?').get(`debit:${jobId}`).amount, -1) // la ligne n'a pas été touchée
  } finally { t.restore() }
})

test('tâche planifiée : complète le journal des comptes actifs et ignore les autres', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const old = await t.as('user_old')
    await alice('/jobs', post(image))
    await old('/jobs', post({ ...image, prompt: 'ancien' }))
    t.db.raw.prepare("UPDATE users SET last_seen_at = 1 WHERE id = 'user_old'").run() // inactif depuis longtemps
    t.db.raw.prepare('DELETE FROM credit_ledger').run() // toutes les copies manquent
    const pending = []
    app.scheduled({}, t.env, { waitUntil: (p) => pending.push(p) })
    await Promise.all(pending)
    assert.equal(rows(t, 'user_alice').length, 2) // crédit de départ + débit
    assert.equal(rows(t, 'user_old').length, 0) // pas actif : non contrôlé ce soir
    const audit = await reconcile(t.db, 'user_alice', await t.env.ACCOUNT.get('user_alice').fetch('https://account/ops').then((r) => r.json()))
    assert.equal(audit.ok, true)
  } finally { t.restore() }
})

test('sans D1, les mouvements fonctionnent et /me/ledger répond 503', async () => {
  const t = await makeApi({ DB: null })
  try {
    const alice = await t.as('user_alice')
    assert.equal((await alice('/jobs', post(image))).status, 202)
    assert.equal((await alice('/me/ledger')).status, 503)
    assert.equal((await alice('/me/ledger/audit')).status, 503)
  } finally { t.restore() }
})
