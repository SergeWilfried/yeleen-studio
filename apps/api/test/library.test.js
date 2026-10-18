import { test } from 'node:test'
import assert from 'node:assert/strict'
import { purgeDeleted } from '../src/library.js'
import { PNG, image, makeApi, post } from './harness.js'

const upload = (bytes = PNG, type = 'image/png', query = 'name=Photo%20de%20test.png') => ({ method: 'POST', headers: { 'content-type': type, 'content-length': String(bytes.length) }, body: bytes, query })
const up = (api, o = upload()) => api(`/library/uploads?${o.query}`, { method: o.method, headers: o.headers, body: o.body })
const json = (r) => r.json()

test('historique : une génération est copiée dans D1 à la création et à la fin ; la liste se pagine', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const ids = []
    for (let i = 0; i < 3; i++) {
      ids.push((await json(await alice('/jobs', post({ ...image, prompt: `chat ${i}`, requestId: `req-alice-000${i}` })))).jobId)
      await new Promise((r) => setTimeout(r, 3)) // dates de création distinctes
    }
    const row = t.db.raw.prepare('SELECT * FROM jobs WHERE id = ?').get(ids[0])
    assert.equal(row.user_id, 'user_alice')
    assert.equal(row.status, 'IN_QUEUE')
    assert.equal(row.prompt, 'chat 0')
    assert.equal(row.model_id, 'nano-banana-pro')
    assert.deepEqual(JSON.parse(row.params), { resolution: '1K', count: 1, title: 'Nano Banana Pro' })

    t.phase.v = 'done'
    const done = await json(await alice(`/jobs/${ids[0]}`))
    assert.equal(done.status, 'COMPLETED')
    const after = t.db.raw.prepare('SELECT status, outputs, finished_at FROM jobs WHERE id = ?').get(ids[0])
    assert.equal(after.status, 'COMPLETED')
    assert.ok(after.finished_at > 0)
    assert.match(after.outputs, /\/files\/outputs\/user_alice\//)

    const p1 = await json(await alice('/jobs?limit=2'))
    assert.deepEqual(p1.jobs.map((j) => j.prompt), ['chat 2', 'chat 1']) // les plus récentes d'abord
    assert.ok(p1.next)
    const p2 = await json(await alice(`/jobs?limit=2&before=${p1.next}`))
    assert.deepEqual(p2.jobs.map((j) => j.prompt), ['chat 0'])
    assert.equal(p2.next, null)
    assert.equal(p2.jobs[0].status, 'COMPLETED')

    const bob = await t.as('user_bob')
    assert.deepEqual((await json(await bob('/jobs'))).jobs, []) // chacun ne voit que les siennes
  } finally { t.restore() }
})

test('une génération terminée entre une seule fois dans la bibliothèque, et son fichier se lit', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const { jobId } = await json(await alice('/jobs', post(image)))
    t.phase.v = 'done'
    const done = await json(await alice(`/jobs/${jobId}`))
    assert.equal(done.assets.length, 1)
    const a = done.assets[0]
    assert.equal(a.source, 'generated')
    assert.equal(a.kind, 'image')
    assert.equal(a.name, 'Nano Banana Pro')
    assert.equal(a.prompt, 'un chat sur un toit')
    assert.equal(a.jobId, jobId)
    await alice(`/jobs/${jobId}`) // une autre interrogation : rien de nouveau
    const list = await json(await alice('/library'))
    assert.equal(list.assets.length, 1)
    assert.equal(list.assets[0].id, a.id)
    const file = await alice(new URL(a.url).pathname)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'image/png')
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [...PNG])
  } finally { t.restore() }
})

test('import : le fichier va dans R2 et dans la bibliothèque ; types, taille et quota sont contrôlés', async () => {
  const t = await makeApi({ MAX_LIBRARY_BYTES: '40' })
  try {
    const alice = await t.as('user_alice')
    const res = await up(alice)
    assert.equal(res.status, 201)
    const a = await json(res)
    assert.equal(a.source, 'upload')
    assert.equal(a.name, 'Photo de test')
    assert.equal(a.bytes, PNG.length)
    assert.match(a.url, /\/files\/library\/user_alice\/.+\.png$/)
    assert.equal((await alice(new URL(a.url).pathname)).status, 200)
    assert.equal(t.bucket.files.size, 1)

    assert.equal((await up(alice, upload(PNG, 'application/pdf'))).status, 415)
    assert.equal((await up(alice, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG, query: 'name=x' })).status, 411) // longueur inconnue
    assert.equal((await up(alice, upload(new Uint8Array(26 * 1024 * 1024), 'image/png'))).status, 413) // image trop lourde
    const over = await up(alice, upload(new Uint8Array(30), 'image/png')) // 12 + 30 = 42 octets > 40
    assert.equal(over.status, 413)
    assert.equal((await json(over)).error, 'quota_exceeded')
    assert.equal(t.bucket.files.size, 1) // rien d'écrit dans R2 pour un refus
    assert.equal((await up(alice, upload(new Uint8Array(20), 'image/png'))).status, 201) // 12 + 20 = 32 : passe
  } finally { t.restore() }
})

test('renommer, supprimer, annuler, puis effacement définitif après le délai', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const a = await json(await up(alice))
    const bob = await t.as('user_bob')
    assert.equal((await bob(`/library/${a.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'volé' }) })).status, 404) // pas à lui
    assert.equal((await alice(`/library/${a.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '  Nouveau nom  ' }) })).status, 200)
    assert.equal((await json(await alice('/library'))).assets[0].name, 'Nouveau nom')
    assert.equal((await alice(`/library/${a.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '   ' }) })).status, 400)

    assert.deepEqual(await json(await bob('/library/delete', post({ ids: [a.id] }))), { deleted: 0 }) // Bob ne supprime pas l'asset d'Alice
    assert.deepEqual(await json(await alice('/library/delete', post({ ids: [a.id] }))), { deleted: 1 })
    assert.equal((await json(await alice('/library'))).assets.length, 0) // masqué tout de suite
    assert.equal(t.bucket.files.size, 1) // le fichier est encore là : on peut annuler
    assert.deepEqual(await json(await alice('/library/restore', post({ ids: [a.id] }))), { restored: 1 })
    assert.equal((await json(await alice('/library'))).assets.length, 1)

    await alice('/library/delete', post({ ids: [a.id] }))
    assert.equal(await purgeDeleted(t.db, t.bucket, { now: Date.now() + 1000 }), 0) // trop tôt : délai de grâce
    assert.equal(t.bucket.files.size, 1)
    assert.equal(await purgeDeleted(t.db, t.bucket, { now: Date.now() + 25 * 3600_000 }), 1)
    assert.equal(t.bucket.files.size, 0) // le fichier est effacé de R2
    assert.equal(t.db.raw.prepare('SELECT COUNT(*) AS n FROM assets').get().n, 0)
  } finally { t.restore() }
})

test('favoris : les miens et ceux de la bibliothèque Yeleen, chacun pour soi', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const bob = await t.as('user_bob')
    const a = await json(await up(alice))
    assert.equal(a.starred, false)
    assert.equal((await alice(`/library/favorites/mine/${a.id}`, { method: 'PUT' })).status, 200)
    assert.equal((await json(await alice('/library'))).assets[0].starred, true)
    assert.deepEqual((await json(await alice('/library/favorites?scope=mine'))).ids, [a.id])
    assert.equal((await bob(`/library/favorites/mine/${a.id}`, { method: 'PUT' })).status, 404) // pas son asset
    assert.equal((await alice(`/library/favorites/mine/inconnu`, { method: 'PUT' })).status, 404)
    assert.equal((await alice(`/library/favorites/yeleen/perso-1`, { method: 'PUT' })).status, 200)
    assert.equal((await alice(`/library/favorites/yeleen/n-existe-pas`, { method: 'PUT' })).status, 404)
    assert.equal((await alice(`/library/favorites/autre/x`, { method: 'PUT' })).status, 400)
    assert.deepEqual((await json(await alice('/library/favorites?scope=yeleen'))).ids, ['perso-1'])
    assert.deepEqual((await json(await bob('/library/favorites?scope=yeleen'))).ids, []) // chacun les siens
    await alice(`/library/favorites/mine/${a.id}`, { method: 'DELETE' })
    assert.equal((await json(await alice('/library'))).assets[0].starred, false)
  } finally { t.restore() }
})

test('la bibliothèque Yeleen vient de D1 : éléments publiés, dans l’ordre', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    const { items } = await json(await alice('/catalog'))
    assert.equal(items.length, 15)
    assert.deepEqual(items.slice(0, 2).map((i) => i.id), ['perso-1', 'perso-2'])
    assert.equal(items.filter((i) => i.category === 'video').length, 3)
    assert.deepEqual(items.find((i) => i.id === 'video-1').art, { palette: 'video', index: 2 })
    assert.equal(items.every((i) => i.placeholder === true), true)
    t.db.raw.prepare("UPDATE catalog_items SET published = 0 WHERE id = 'perso-1'").run() // dépublier sans déploiement
    assert.equal((await json(await alice('/catalog'))).items.length, 14)
    assert.equal((await (await t.req('/catalog')).status), 401) // sans connexion : refus
  } finally { t.restore() }
})

test('filtres de la bibliothèque et pagination', async () => {
  const t = await makeApi()
  try {
    const alice = await t.as('user_alice')
    for (let i = 0; i < 3; i++) { await up(alice, upload(PNG, 'image/png', `name=img${i}`)); await new Promise((r) => setTimeout(r, 3)) }
    await up(alice, upload(new Uint8Array([1, 2, 3]), 'audio/mpeg', 'name=voix&secs=4.26'))
    const all = await json(await alice('/library'))
    assert.equal(all.assets.length, 4)
    assert.equal(all.assets[0].name, 'voix') // le plus récent d'abord
    assert.equal(all.assets[0].secs, 4.3)
    assert.deepEqual((await json(await alice('/library?kind=audio'))).assets.map((a) => a.name), ['voix'])
    assert.equal((await json(await alice('/library?source=generated'))).assets.length, 0)
    const p1 = await json(await alice('/library?limit=2'))
    assert.equal(p1.assets.length, 2)
    const p2 = await json(await alice(`/library?limit=2&before=${p1.next}`))
    assert.equal(p2.assets.length, 2)
    assert.equal(p2.next, null)
  } finally { t.restore() }
})

test('sans D1, la bibliothèque répond 503 et le reste fonctionne', async () => {
  const t = await makeApi({ DB: null })
  try {
    const alice = await t.as('user_alice')
    assert.equal((await alice('/library')).status, 503)
    assert.equal((await alice('/catalog')).status, 503)
    assert.equal((await alice('/jobs')).status, 503)
    assert.equal((await alice('/wallet')).status, 200)
    t.phase.v = 'done'
    const { jobId } = await json(await alice('/jobs', post(image)))
    assert.equal((await json(await alice(`/jobs/${jobId}`))).status, 'COMPLETED') // une génération se termine sans D1 (sans entrée de bibliothèque)
  } finally { t.restore() }
})

test('CORS : le navigateur peut envoyer PUT, PATCH et DELETE depuis le site', async () => {
  const t = await makeApi()
  try {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const pre = await t.req('/library/x', { method: 'OPTIONS', headers: { origin: 'https://yeleen.example.workers.dev', 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' } })
      assert.ok(pre.status < 300, method)
      assert.match(pre.headers.get('access-control-allow-methods') ?? '', new RegExp(method))
    }
  } finally { t.restore() }
})
