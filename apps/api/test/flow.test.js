import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../src/account-do.js'
import app from '../src/index.js'

/** L'API entière, avec le vrai Account (stockage en mémoire) et un faux fal. */
function setup(fal, vars = {}) {
  const store = new Map()
  const storage = { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)) } }
  const account = new Account({ storage }, { ENV: 'dev' })
  const env = {
    FAL_KEY: 'test', ENV: 'dev', ALLOWED_ORIGINS: 'http://localhost:5174', ...vars,
    ACCOUNT: { idFromName: (n) => n, get: () => ({ fetch: (url, init) => account.fetch(new Request(url, init)) }) },
  }
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const r = fal(String(url), init)
    if (r.bytes) return new Response(r.bytes, { status: 200, headers: { 'content-length': String(r.bytes.length) } })
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }
  const req = (path, init) => app.fetch(new Request(`http://api${path}`, init), env)
  return { req, restore: () => { globalThis.fetch = real } }
}
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const image = { kind: 'image', modelId: 'nano-banana-pro', prompt: 'un chat', resolution: '1K', count: 1 }

const queued = { request_id: 'r1', status_url: 'https://queue.fal.run/x/requests/r1/status', response_url: 'https://queue.fal.run/x/requests/r1', cancel_url: 'https://queue.fal.run/x/requests/r1/cancel' }

test('succès : débit, suivi, sortie, solde conservé', async () => {
  let phase = 'queue'
  const t = setup((url) => {
    if (url.endsWith('/nano-banana-pro')) return { body: queued }
    if (url.includes('/status')) return { body: { status: phase === 'queue' ? 'IN_QUEUE' : 'COMPLETED', queue_position: 1 } }
    return { body: { images: [{ url: 'https://cdn/x.png', content_type: 'image/png', width: 1024, height: 1024 }] } }
  })
  try {
    const start = (await (await t.req('/wallet')).json()).balance
    const res = await t.req('/jobs', post(image))
    const { jobId, balance } = await res.json()
    assert.equal(res.status, 202)
    assert.ok(balance < start)
    assert.equal((await (await t.req(`/jobs/${jobId}`)).json()).status, 'IN_QUEUE')
    phase = 'done'
    const done = await (await t.req(`/jobs/${jobId}`)).json()
    assert.equal(done.status, 'COMPLETED')
    assert.equal(done.outputs[0].url, 'https://cdn/x.png')
    assert.equal(done.balance, balance)
  } finally { t.restore() }
})

test('échec de fal à l’envoi : remboursé tout de suite', async () => {
  const t = setup(() => ({ status: 500, body: { detail: 'boom' } }))
  try {
    const start = (await (await t.req('/wallet')).json()).balance
    const res = await t.req('/jobs', post(image))
    const out = await res.json()
    assert.equal(res.status, 502)
    assert.equal(out.error, 'provider')
    assert.equal(out.balance, start)
  } finally { t.restore() }
})

test('échec pendant la génération : une seule fois remboursé, même si on interroge deux fois', async () => {
  const t = setup((url) => {
    if (url.endsWith('/nano-banana-pro')) return { body: queued }
    if (url.includes('/status')) return { body: { status: 'COMPLETED' } }
    return { status: 500, body: { detail: 'erreur interne' } }
  })
  try {
    const start = (await (await t.req('/wallet')).json()).balance
    const { jobId } = await (await t.req('/jobs', post(image))).json()
    const a = await (await t.req(`/jobs/${jobId}`)).json()
    const b = await (await t.req(`/jobs/${jobId}`)).json()
    assert.equal(a.status, 'FAILED')
    assert.equal(a.failure, 'provider')
    assert.equal(b.status, 'FAILED')
    assert.equal(b.balance, start)
  } finally { t.restore() }
})

test('refus de contenu et solde insuffisant ne contactent pas fal', async () => {
  let calls = 0
  const t = setup(() => { calls++; return { body: queued } }, { MAX_JOB_COST: '100000' }) // plafond levé : on teste ici le solde, pas le plafond
  try {
    assert.equal((await t.req('/jobs', post({ ...image, prompt: 'scène de violence' }))).status, 422)
    const big = await t.req('/jobs', post({ ...image, resolution: '4K', count: 4 }))
    const small = await t.req('/jobs', post({ kind: 'audio', modelId: 'eleven-v3', prompt: 'x'.repeat(200000) }))
    assert.equal(small.status, 402)
    assert.equal((await small.json()).error, 'insufficient')
    assert.ok(big.status === 202 || big.status === 402)
    assert.ok(calls <= 1)
  } finally { t.restore() }
})

test('annulation en file : remboursement complet', async () => {
  const t = setup((url) => (url.endsWith('/nano-banana-pro') ? { body: queued } : { body: {} }))
  try {
    const start = (await (await t.req('/wallet')).json()).balance
    const { jobId } = await (await t.req('/jobs', post(image))).json()
    const out = await (await t.req(`/jobs/${jobId}/cancel`, { method: 'POST' })).json()
    assert.equal(out.status, 'CANCELED')
    assert.equal(out.balance, start)
  } finally { t.restore() }
})

test('origine non autorisée : pas d’en-tête CORS', async () => {
  const t = setup(() => ({ body: {} }))
  try {
    const ok = await t.req('/health', { headers: { origin: 'http://localhost:5174' } })
    const bad = await t.req('/health', { headers: { origin: 'https://evil.example' } })
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5174')
    assert.equal(bad.headers.get('access-control-allow-origin'), null)
  } finally { t.restore() }
})

const png = () => ({ method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array([137, 80, 78, 71]) })

test('téléversement : le fichier est déposé chez fal et son adresse renvoyée', async () => {
  const seen = []
  const t = setup((url, init) => {
    seen.push(`${init?.method} ${url.split('?')[0]}`)
    if (url.includes('storage/upload/initiate')) return { body: { file_url: 'https://v3b.fal.media/files/b/x/a.png', upload_url: 'https://v3b.fal.media/upload/xyz' } }
    return { body: {} }
  })
  try {
    const res = await t.req('/uploads?name=mon photo.png', png())
    assert.equal(res.status, 200)
    assert.equal((await res.json()).url, 'https://v3b.fal.media/files/b/x/a.png')
    assert.deepEqual(seen, ['POST https://rest.alpha.fal.ai/storage/upload/initiate', 'PUT https://v3b.fal.media/upload/xyz'])
  } finally { t.restore() }
})

test('téléversement : type non pris en charge et fichier trop gros refusés', async () => {
  const t = setup(() => ({ body: {} }))
  try {
    assert.equal((await t.req('/uploads', { method: 'POST', headers: { 'content-type': 'application/x-msdownload' }, body: 'x' })).status, 415)
    assert.equal((await t.req('/uploads', { method: 'POST', headers: { 'content-type': 'image/png', 'content-length': String(30 * 1024 * 1024) }, body: 'x' })).status, 413)
  } finally { t.restore() }
})

test('vidéo : une demande plus chère que le plafond est refusée sans débit ni appel à fal', async () => {
  let calls = 0
  const t = setup(() => { calls++; return { body: queued } }, { MAX_JOB_COST: '100' })
  try {
    const F = 'https://v3b.fal.media/files/b/a/x.png'
    const req = { kind: 'video', modelId: 'ltx-2-5-fast', plans: [{ text: 'un plan', dur: 20 }], secs: 20, resolution: '2160p', fps: 25, ratio: 'auto', startImageUrl: F }
    const start = (await (await t.req('/wallet')).json()).balance
    const res = await t.req('/jobs', post(req))
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'too_expensive')
    assert.equal((await (await t.req('/wallet')).json()).balance, start)
    assert.equal(calls, 0)
  } finally { t.restore() }
})

test('R2 : à la fin de la génération le fichier est copié et la sortie pointe vers /files', async () => {
  const files = new Map()
  const FILES = { put: async (k, body) => { files.set(k, new Uint8Array(await new Response(body).arrayBuffer())) }, get: async (k) => (files.has(k) ? { size: files.get(k).length, body: files.get(k), httpMetadata: { contentType: 'image/png' }, etag: 'e' } : null) }
  const t = setup((url) => {
    if (url.endsWith('/nano-banana-pro')) return { body: queued }
    if (url.includes('/status')) return { body: { status: 'COMPLETED' } }
    if (url.endsWith('x.png')) return { bytes: new Uint8Array([9, 8, 7]) }
    return { body: { images: [{ url: 'https://cdn.fal.media/x.png', content_type: 'image/png', width: 1, height: 1 }] } }
  }, { FILES })
  try {
    const { jobId } = await (await t.req('/jobs', post(image))).json()
    const done = await (await t.req(`/jobs/${jobId}`)).json()
    assert.equal(done.status, 'COMPLETED')
    assert.equal(done.outputs[0].url, `http://api/files/outputs/demo/${jobId}/0.png`)
    assert.equal(done.outputs[0].stored, true)
    const file = await t.req(`/files/outputs/demo/${jobId}/0.png`, { headers: { origin: 'http://localhost:5174' } })
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('access-control-allow-origin'), 'http://localhost:5174')
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [9, 8, 7])
    // relire la génération ne recopie rien
    assert.equal((await (await t.req(`/jobs/${jobId}`)).json()).outputs[0].url, done.outputs[0].url)
  } finally { t.restore() }
})

test('R2 : un suivi concurrent pendant la copie n’en lance pas une deuxième', async () => {
  let copies = 0
  let release
  const gate = new Promise((r) => { release = r })
  const FILES = { put: async () => { copies++; await gate }, get: async () => null }
  const t = setup((url) => {
    if (url.endsWith('/nano-banana-pro')) return { body: queued }
    if (url.includes('/status')) return { body: { status: 'COMPLETED' } }
    if (url.endsWith('x.png')) return { bytes: new Uint8Array([1]) }
    return { body: { images: [{ url: 'https://cdn.fal.media/x.png', content_type: 'image/png' }] } }
  }, { FILES })
  try {
    const { jobId } = await (await t.req('/jobs', post(image))).json()
    const first = t.req(`/jobs/${jobId}`)
    await new Promise((r) => setTimeout(r, 30))
    const second = await (await t.req(`/jobs/${jobId}`)).json()
    assert.equal(second.status, 'IN_PROGRESS')
    release()
    assert.equal((await (await first).json()).status, 'COMPLETED')
    assert.equal(copies, 1)
  } finally { t.restore() }
})

const okFal = (phase) => (url) => {
  if (url.endsWith('/nano-banana-pro')) return { body: queued }
  if (url.includes('/status')) return { body: { status: phase.v === 'done' ? 'COMPLETED' : 'IN_QUEUE', queue_position: 1 } }
  return { body: { images: [{ url: 'https://cdn/x.png', content_type: 'image/png', width: 1024, height: 1024 }] } }
}

test('la même demande rejouée ne débite qu’une fois', async () => {
  const t = setup(okFal({ v: 'queue' }))
  try {
    const start = (await (await t.req('/wallet')).json()).balance
    const a = await (await t.req('/jobs', post({ ...image, requestId: 'req-aaaaaaaa-1' }))).json()
    const res = await t.req('/jobs', post({ ...image, requestId: 'req-aaaaaaaa-1' }))
    const b = await res.json()
    assert.equal(res.status, 202)
    assert.equal(b.jobId, a.jobId)
    assert.equal(b.deduped, true)
    assert.equal(b.balance, a.balance) // un seul débit
    assert.ok(start - a.balance > 0)
    const other = await (await t.req('/jobs', post({ ...image, requestId: 'req-aaaaaaaa-2' }))).json()
    assert.notEqual(other.jobId, a.jobId) // une autre clé est une autre demande
  } finally { t.restore() }
})

test('au plus MAX_ACTIVE_JOBS générations en même temps ; une terminée libère sa place', async () => {
  const phase = { v: 'queue' }
  const t = setup(okFal(phase), { MAX_ACTIVE_JOBS: '2' })
  try {
    const ids = []
    for (let i = 0; i < 2; i++) ids.push((await (await t.req('/jobs', post(image))).json()).jobId)
    const start = (await (await t.req('/wallet')).json()).balance
    const third = await t.req('/jobs', post(image))
    assert.equal(third.status, 429)
    assert.equal((await third.json()).error, 'too_many_active')
    assert.equal((await (await t.req('/wallet')).json()).balance, start) // refusée avant tout débit
    phase.v = 'done'
    assert.equal((await (await t.req(`/jobs/${ids[0]}`)).json()).status, 'COMPLETED')
    assert.equal((await t.req('/jobs', post(image))).status, 202)
  } finally { t.restore() }
})

test('une demande refusée (solde ou fal) libère sa place', async () => {
  const t = setup(() => ({ status: 500, body: { detail: 'boom' } }), { MAX_ACTIVE_JOBS: '1' })
  try {
    assert.equal((await t.req('/jobs', post(image))).status, 502) // échec fal : remboursé et place rendue
    assert.equal((await t.req('/jobs', post(image))).status, 502) // sinon ce serait un 429
    assert.equal((await t.req('/jobs', post({ ...image, count: 4, resolution: '4K' }))).status === 429, false)
  } finally { t.restore() }
})
