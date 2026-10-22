import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_MODELS, IMAGE_MODELS } from '@studio/catalog'
import { buildInput, outputsOf } from '../src/inputs.js'
import { isBlocked } from '../src/moderation.js'

const nano = IMAGE_MODELS.find((m) => m.id === 'nano-banana-pro')
const flux = IMAGE_MODELS.find((m) => m.id === 'flux-3')

test('Nano Banana : prompt composé du style, nombre d’images, format et résolution', () => {
  const i = buildInput('image', nano, { prompt: 'un hippo', styleHint: 'anime', brandStyle: 'tons chauds', count: 2, resolution: '2K', ratio: 'Auto' })
  assert.deepEqual(i, { prompt: 'un hippo, anime, tons chauds', num_images: 2, aspect_ratio: 'auto', resolution: '2K', output_format: 'png' })
})

test('Flux 3 : résolution en minuscules et pas de num_images', () => {
  const i = buildInput('image', flux, { prompt: 'a', resolution: '2K', ratio: '16:9' })
  assert.equal(i.resolution, '2k')
  assert.equal('num_images' in i, false)
})

test('voix : seuls les paramètres que le modèle expose sont envoyés', () => {
  const v3 = AUDIO_MODELS.find((m) => m.id === 'eleven-v3')
  const i = buildInput('audio', v3, { prompt: ' Bonjour ', voice: 'Sarah', stability: 0.3, language: 'fr', normalization: 'on', timestamps: true })
  assert.deepEqual(i, { text: 'Bonjour', voice: 'Sarah', stability: 0.3, language_code: 'fr', apply_text_normalization: 'on', timestamps: true })
  assert.equal('language_code' in buildInput('audio', v3, { prompt: 'a', language: 'auto' }), false)
})

test('les sorties ont le même format quel que soit le média', () => {
  const img = outputsOf('image', { images: [{ url: 'u1', content_type: 'image/png', width: 10, height: 20 }] })
  assert.deepEqual(img, [{ url: 'u1', contentType: 'image/png', width: 10, height: 20 }])
  assert.equal(outputsOf('audio', { audio: { url: 'a', content_type: 'audio/mpeg' } })[0].url, 'a')
  assert.deepEqual(outputsOf('image', {}), [])
})

test('la modération refuse les mots interdits', () => {
  assert.equal(isBlocked('une scène de violence'), true)
  assert.equal(isBlocked('un chat'), false)
})

test('workflow : les textes sont nettoyés et les villes réparties sur prompt … prompt_7', async () => {
  const { findWorkflow } = await import('@studio/catalog/workflows')
  const replace = buildInput('workflow', findWorkflow('replace-anything'), { inputs: { image_url: 'https://v3.fal.media/a.png', text_prompt: ' le sac ', prompt: 'un sac rouge' } })
  assert.deepEqual(replace, { image_url: 'https://v3.fal.media/a.png', text_prompt: 'le sac', prompt: 'un sac rouge' })
  const city = buildInput('workflow', findWorkflow('city-journey'), { inputs: { image_urls: ['https://v3.fal.media/p.png'], cities: 'Dakar\n\n Paris \nTokyo' } })
  assert.deepEqual(city, { image_urls: ['https://v3.fal.media/p.png'], prompt: 'Dakar', prompt_2: 'Paris', prompt_3: 'Tokyo', prompt_4: 'Dakar', prompt_5: 'Paris', prompt_6: 'Tokyo', prompt_7: 'Dakar' })
})
