import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { Account } from '../src/account-do.js'
import app from '../src/index.js'
import { resetUserCache } from '../src/users.js'
import { testD1 } from './d1.js'

beforeEach(() => resetUserCache())

/** L'API entière avec le vrai Account, une vraie base D1 (SQLite), un faux bucket R2 et un faux fal. */
function setup({ files = true, vars = {} } = {}) {
  const db = testD1()
  const store = new Map()
  const storage = { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)) } }
  const account = new Account({ storage }, { ENV: 'dev', DB: db })
  const objects = new Map()
  const bucket = { put: async (key, body) => { objects.set(key, body) }, get: async () => null }
  const env = {
    ENV: 'dev', FAL_KEY: 'test', DB: db, ALLOWED_ORIGINS: 'http://localhost:5174', ...(files ? { FILES: bucket } : {}), ...vars,
    ACCOUNT: { idFromName: (n) => n, get: () => ({ fetch: (url, init) => account.fetch(new Request(url, init)) }) },
  }
  let phase = 'queue'
  const real = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/nano-banana-pro')) return Response.json({ request_id: 'r1', status_url: 'https://q/x/status', response_url: 'https://q/x', cancel_url: 'https://q/x/cancel' })
    if (u.includes('/status')) return Response.json({ status: phase === 'queue' ? 'IN_PROGRESS' : 'COMPLETED' })
    if (u === 'https://q/x') return Response.json({ images: [{ url: 'https://cdn/a.png', content_type: 'image/png', width: 1024, height: 768 }, { url: 'https://cdn/b.png', content_type: 'image/png', width: 1024, height: 768 }] })
    if (u.startsWith('https://cdn/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    return Response.json({}, { status: 404 })
  }
  const json = async (path, init) => { const res = await app.fetch(new Request(`http://api${path}`, init), env); return { status: res.status, body: await res.json(), headers: res.headers } }
  const generate = async () => {
    const { body } = await json('/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'image', modelId: 'nano-banana-pro', prompt: '  un chat sur un toit  ', resolution: '1K', count: 2, requestId: 'demande-0001' }) })
    await json(`/jobs/${body.jobId}`) // en cours
    phase = 'done'
    await json(`/jobs/${body.jobId}`) // terminée : sorties copiées dans R2
    return body.jobId
  }
  return { db, json, generate, objects, rows: (sql) => db.raw.prepare(sql).all(), restore: () => { globalThis.fetch = real } }
}

test('une génération terminée : sa ligne dans `jobs` et un fichier par sortie dans `assets`, rendus par GET /assets', async () => {
  const t = setup()
  try {
    const jobId = await t.generate()
    const [job] = t.rows('SELECT * FROM jobs')
    assert.equal(job.id, jobId)
    assert.equal(job.user_id, 'demo')
    assert.equal(job.status, 'COMPLETED')
    assert.equal(job.prompt, 'un chat sur un toit')
    assert.equal(JSON.parse(job.params).resolution, '1K')
    assert.equal(JSON.parse(job.params).requestId, undefined) // ni la clé de demande ni le texte dans les réglages
    assert.ok(job.started_at && job.finished_at >= job.started_at)
    assert.equal(JSON.parse(job.outputs).length, 2)

    const assets = t.rows('SELECT id, kind, r2_key, name, idx, width FROM assets ORDER BY idx')
    assert.equal(assets.length, 2)
    assert.equal(assets[0].r2_key, `outputs/demo/${jobId}/0.png`)
    assert.ok(t.objects.has(assets[1].r2_key))
    assert.equal(assets[1].name, 'un chat sur un toit · 2/2')
    assert.equal(assets[0].width, 1024)

    const list = await t.json('/assets?kind=image')
    assert.equal(list.body.assets.length, 2)
    assert.equal(list.body.assets[0].url, `http://api/files/outputs/demo/${jobId}/${list.body.assets[0].index}.png`)
    assert.equal((await t.json('/assets?kind=video')).body.assets.length, 0)

    // Interroger encore une génération terminée ne crée pas de doublon.
    await t.json(`/jobs/${jobId}`)
    assert.equal(t.rows('SELECT * FROM assets').length, 2)
  } finally { t.restore() }
})

test('sans R2, la génération est copiée mais aucun fichier (l’adresse de fal est temporaire)', async () => {
  const t = setup({ files: false })
  try {
    await t.generate()
    assert.equal(t.rows('SELECT status FROM jobs')[0].status, 'COMPLETED')
    assert.equal(t.rows('SELECT * FROM assets').length, 0)
  } finally { t.restore() }
})

test('suppression : le fichier disparaît de la bibliothèque (et de mes favoris), une seule fois', async () => {
  const t = setup()
  try {
    const jobId = await t.generate()
    const id = `${jobId}:0`
    assert.equal((await t.json(`/favorites/mine/${encodeURIComponent(id)}`, { method: 'PUT' })).status, 200)
    assert.equal((await t.json(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })).status, 200)
    assert.equal((await t.json(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })).status, 404)
    assert.deepEqual((await t.json('/assets')).body.assets.map((a) => a.id), [`${jobId}:1`])
    assert.equal((await t.json('/favorites')).body.favorites.length, 0)
    assert.ok(t.rows('SELECT deleted_at FROM assets WHERE idx = 0')[0].deleted_at) // suppression douce
  } finally { t.restore() }
})

test('favoris : ajout idempotent, retrait, portée et identifiant contrôlés', async () => {
  const t = setup()
  try {
    await t.json('/favorites/yeleen/perso-1', { method: 'PUT' })
    await t.json('/favorites/yeleen/perso-1', { method: 'PUT' })
    await t.json('/favorites/mine/job-1:0', { method: 'PUT' })
    const favs = (await t.json('/favorites')).body.favorites
    assert.deepEqual(favs.map((f) => `${f.scope}/${f.id}`).sort(), ['mine/job-1:0', 'yeleen/perso-1'])
    await t.json('/favorites/yeleen/perso-1', { method: 'DELETE' })
    assert.equal((await t.json('/favorites')).body.favorites.length, 1)
    assert.equal((await t.json('/favorites/autre/x', { method: 'PUT' })).status, 400)
    assert.equal((await t.json(`/favorites/mine/${'x'.repeat(200)}`, { method: 'PUT' })).status, 400)
  } finally { t.restore() }
})

test('Bibliothèque Yeleen : publique, publiés seulement, dans l’ordre, au format de yeleen.json', async () => {
  const t = setup({ vars: { ENV: 'production', CLERK_ISSUER: 'https://clerk.example' } }) // en production : tout le reste exige une connexion
  try {
    const ins = t.db.raw.prepare('INSERT INTO catalog_items (id, kind, category, name, url, art, seed, placeholder, sort, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
    ins.run('b', 'image', 'object', 'Calebasse', 'https://cdn/b.png', null, 2, 0, 2, 1)
    ins.run('a', 'image', 'character', 'Awa', null, '{"hue":30}', 1, 1, 1, 1)
    ins.run('c', 'video', 'video', 'Brouillon', 'https://cdn/c.mp4', null, 3, 0, 0, 0)
    const res = await t.json('/catalog')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('cache-control'), /max-age=300/)
    assert.deepEqual(res.body.items.map((e) => e.id), ['a', 'b'])
    assert.deepEqual(res.body.items[0], { id: 'a', kind: 'image', category: 'character', name: 'Awa', art: { hue: 30 }, seed: 1, placeholder: true })
    assert.equal((await t.json('/assets')).status, 401) // la bibliothèque personnelle, elle, reste protégée
  } finally { t.restore() }
})

test('D1 absente : les routes de bibliothèque répondent 503', async () => {
  const t = setup()
  try {
    t.db.failing = true
    assert.equal((await t.json('/favorites/yeleen/x', { method: 'PUT' })).status, 503)
  } finally { t.restore() }
})

test('migrations : rejouées sur une base existante, sans erreur ni changement', () => {
  const db = testD1() // toutes les migrations déjà passées
  const dir = new URL('../migrations/', import.meta.url)
  const before = db.raw.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'))
  assert.deepEqual(db.raw.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all(), before)
})
