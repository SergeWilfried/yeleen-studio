import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyFor, serveFile, storeOutputs } from '../src/storage.js'

/** Un bucket R2 minimal en mémoire, avec lecture par plage. */
function fakeBucket({ failPut = false } = {}) {
  const files = new Map()
  return {
    files,
    async put(key, body, opts) {
      if (failPut) throw new Error('R2 indisponible')
      const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(await new Response(body).arrayBuffer())
      files.set(key, { bytes, httpMetadata: opts?.httpMetadata })
    },
    async get(key, opts) {
      const f = files.get(key)
      if (!f) return null
      const obj = { size: f.bytes.length, etag: 'abc', httpMetadata: f.httpMetadata, body: f.bytes }
      const m = /bytes=(\d+)-(\d*)/.exec(opts?.range?.get('range') ?? '')
      if (m) {
        const start = Number(m[1])
        const end = m[2] ? Number(m[2]) : f.bytes.length - 1
        obj.body = f.bytes.slice(start, end + 1)
        obj.range = { offset: start, length: end - start + 1 }
      }
      return obj
    },
  }
}
const bin = (...n) => new Response(new Uint8Array(n), { headers: { 'content-length': String(n.length) } })
const hdr = (o) => new Headers(o)

test('la clé contient le compte, la génération, le rang et la bonne extension', () => {
  assert.equal(keyFor('demo', 'j1', 0, 'image/png'), 'outputs/demo/j1/0.png')
  assert.equal(keyFor('demo', 'j1', 2, 'video/mp4'), 'outputs/demo/j1/2.mp4')
  assert.equal(keyFor('demo', 'j1', 0, 'x/unknown'), 'outputs/demo/j1/0.bin')
})

test('les sorties sont copiées dans le bucket et pointent vers l’API', async () => {
  const bucket = fakeBucket()
  const out = await storeOutputs({
    bucket, origin: 'http://api', accountId: 'demo', jobId: 'j1',
    outputs: [{ url: 'https://v3.fal.media/a.png', contentType: 'image/png' }, { url: 'https://v3.fal.media/b.png', contentType: 'image/png' }],
    fetch: async () => bin(1, 2, 3, 4),
  })
  assert.deepEqual(out.map((o) => o.url), ['http://api/files/outputs/demo/j1/0.png', 'http://api/files/outputs/demo/j1/1.png'])
  assert.ok(out.every((o) => o.stored))
  assert.deepEqual([...bucket.files.get('outputs/demo/j1/0.png').bytes], [1, 2, 3, 4])
})

test('si la copie échoue, le fichier garde l’adresse de fal (la génération reste utilisable)', async () => {
  const out = await storeOutputs({
    bucket: fakeBucket({ failPut: true }), origin: 'http://api', accountId: 'demo', jobId: 'j1',
    outputs: [{ url: 'https://v3.fal.media/a.png', contentType: 'image/png' }], fetch: async () => bin(1),
  })
  assert.equal(out[0].url, 'https://v3.fal.media/a.png')
  assert.equal(out[0].stored, false)
})

test('sans bucket configuré, rien ne change', async () => {
  const outputs = [{ url: 'https://v3.fal.media/a.png', contentType: 'image/png' }]
  assert.deepEqual(await storeOutputs({ bucket: undefined, origin: 'x', accountId: 'a', jobId: 'j', outputs }), outputs)
})

test('lecture d’un fichier : type, taille, cache long', async () => {
  const bucket = fakeBucket()
  await bucket.put('outputs/demo/j1/0.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer, { httpMetadata: { contentType: 'video/mp4' } })
  const res = await serveFile(bucket, 'outputs/demo/j1/0.mp4', hdr({}))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'video/mp4')
  assert.equal(res.headers.get('content-length'), '10')
  assert.equal(res.headers.get('accept-ranges'), 'bytes')
  assert.match(res.headers.get('cache-control'), /immutable/)
})

test('lecture par plage : 206 avec la bonne tranche (nécessaire pour avancer dans une vidéo)', async () => {
  const bucket = fakeBucket()
  await bucket.put('outputs/demo/j1/0.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer, { httpMetadata: { contentType: 'video/mp4' } })
  const res = await serveFile(bucket, 'outputs/demo/j1/0.mp4', hdr({ range: 'bytes=2-5' }))
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), 'bytes 2-5/10')
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5])
})

test('clés inconnues ou hors du dossier des sorties : 404', async () => {
  const bucket = fakeBucket()
  await bucket.put('secret/x.txt', new Uint8Array([1]).buffer, {})
  assert.equal((await serveFile(bucket, 'outputs/demo/none.png', hdr({}))).status, 404)
  assert.equal((await serveFile(bucket, 'secret/x.txt', hdr({}))).status, 404)
  assert.equal((await serveFile(bucket, 'outputs/../secret/x.txt', hdr({}))).status, 404)
  assert.equal((await serveFile(undefined, 'outputs/a.png', hdr({}))).status, 404)
})
