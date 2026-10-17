import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_MODELS, IMAGE_MODELS, imageCost, voiceCost } from '@studio/catalog'
import { priceJob } from '../src/pricing.js'

test('le prix serveur vient du catalogue', () => {
  const m = IMAGE_MODELS[0]
  const r = priceJob({ kind: 'image', modelId: m.id, prompt: 'un chat', resolution: '2K', count: 2 })
  assert.equal(r.cost, imageCost(m, '2K', 2))
})

test('modèle, type, résolution, format et voix inconnus sont refusés', () => {
  const m = IMAGE_MODELS[0]
  assert.equal(priceJob({ kind: 'gif', modelId: 'x' }).error, 'unknown_kind')
  assert.equal(priceJob({ kind: 'image', modelId: 'nope', prompt: 'a' }).error, 'unknown_model')
  assert.equal(priceJob({ kind: 'image', modelId: m.id, prompt: 'a', resolution: '16K' }).error, 'unsupported_resolution')
  assert.equal(priceJob({ kind: 'image', modelId: m.id, prompt: 'a', ratio: '7:3' }).error, 'unsupported_ratio')
  assert.equal(priceJob({ kind: 'image', modelId: m.id, prompt: '   ' }).error, 'invalid_text')
  assert.equal(priceJob({ kind: 'audio', modelId: AUDIO_MODELS[0].id, prompt: 'Bonjour', voice: 'Inconnue' }).error, 'unknown_voice')
})

test('le nombre d’images est borné par le modèle', () => {
  const m = IMAGE_MODELS[0]
  const r = priceJob({ kind: 'image', modelId: m.id, prompt: 'a', resolution: '1K', count: 99 })
  assert.equal(r.cost, imageCost(m, '1K', m.caps.maxImages))
  const flux = IMAGE_MODELS.find((x) => x.id === 'flux-3')
  assert.equal(priceJob({ kind: 'image', modelId: flux.id, prompt: 'a', resolution: '1K', count: 4 }).count, 1)
})

test('le prix d’une voix suit le nombre de caractères', () => {
  const m = AUDIO_MODELS[0]
  assert.equal(priceJob({ kind: 'audio', modelId: m.id, prompt: 'x'.repeat(1500) }).cost, voiceCost(m, 1500))
})

test('essayage : deux photos déposées chez fal, prix du catalogue', async () => {
  const { TRYON_MODEL, tryonCost } = await import('@studio/catalog')
  const { buildInput, outputsOf } = await import('../src/inputs.js')
  const ok = { kind: 'tryon', modelId: TRYON_MODEL.id, modelImageUrl: 'https://v3.fal.media/files/a.png', garmentImageUrl: 'https://v3.fal.media/files/b.png' }
  assert.equal(priceJob(ok).cost, tryonCost())
  assert.equal(priceJob({ ...ok, garmentImageUrl: 'https://evil.example/b.png' }).error, 'invalid_file_url')
  assert.equal(priceJob({ ...ok, modelImageUrl: undefined }).error, 'invalid_file_url')
  assert.equal(priceJob({ ...ok, modelId: 'x' }).error, 'unknown_model')
  assert.deepEqual(buildInput('tryon', TRYON_MODEL, ok), { model_image: ok.modelImageUrl, garment_image: ok.garmentImageUrl, num_samples: 1, output_format: 'png' })
  assert.equal(outputsOf('tryon', { images: [{ url: 'https://v3.fal.media/x.png', content_type: 'image/png' }] })[0].url, 'https://v3.fal.media/x.png')
})

test('workflow fal : liste fermée, entrées contrôlées, prix du catalogue, sortie lue sans connaître sa forme', async () => {
  const { WORKFLOWS, workflowCost } = await import('@studio/catalog/workflows')
  const { buildInput, outputsOf } = await import('../src/inputs.js')
  const f = 'https://v3.fal.media/files/a.png'
  const weather = WORKFLOWS.find((w) => w.id === 'weather')
  const ok = { kind: 'workflow', modelId: 'weather', inputs: { image_urls: [f], weather: 'pluie' } }
  assert.equal(priceJob(ok).cost, workflowCost(weather))
  assert.equal(priceJob({ ...ok, modelId: 'labsprogiciel-coder/logomaker' }).error, 'unknown_model')
  assert.equal(priceJob({ ...ok, inputs: { image_urls: ['https://evil.example/a.png'], weather: 'pluie' } }).error, 'invalid_file_url')
  assert.equal(priceJob({ ...ok, inputs: { image_urls: [f], weather: '' } }).error, 'invalid_text')
  assert.deepEqual(buildInput('workflow', priceJob(ok).model, ok), { image_urls: [f], weather: 'pluie' })
  const out = outputsOf('workflow', { video: { url: 'https://v3.fal.media/v.mp4', content_type: 'video/mp4' }, extra: { images: [{ url: 'https://v3.fal.media/i.png', content_type: 'image/png' }] }, note: 'texte' })
  assert.deepEqual(out.map((o) => o.url), ['https://v3.fal.media/v.mp4', 'https://v3.fal.media/i.png'])
})
