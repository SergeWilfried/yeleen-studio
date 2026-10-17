import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, imageCost, videoCost, voiceCost, toJetons, findModel } from '../src/models.js'

test('toJetons applique la marge ×2 et un plancher de 0,1', () => {
  assert.equal(toJetons(0), 0.1)
  assert.ok(toJetons(0.14) > toJetons(0.07))
})

test('chaque modèle a un identifiant unique et un prix', () => {
  for (const list of [IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS]) {
    assert.equal(new Set(list.map((m) => m.id)).size, list.length)
    for (const m of list) assert.ok(m.price && m.endpoint, m.id)
  }
})

test('les coûts sont positifs et croissent avec la quantité', () => {
  const img = IMAGE_MODELS[0]
  assert.ok(imageCost(img, img.caps.resolutions[0], 2) > imageCost(img, img.caps.resolutions[0], 1))
  const vid = findModel(VIDEO_MODELS, 'ltx-2-5-fast')
  assert.ok(videoCost(vid, 10, '720p') > videoCost(vid, 5, '720p'))
  assert.ok(voiceCost(AUDIO_MODELS[0], 2500) > voiceCost(AUDIO_MODELS[0], 900))
})

test('les voix ont des identifiants uniques et findVoice retombe sur la première', async () => {
  const { VOICES, findVoice } = await import('../src/voices.js')
  assert.equal(new Set(VOICES.map((v) => v.id)).size, VOICES.length)
  assert.equal(findVoice('inconnue').id, VOICES[0].id)
})

test('modèles : un par workflow, au prix du catalogue, avec ce qui manque pour lancer', async () => {
  const { RECIPES, recipeCost, recipeIssue } = await import('../src/recipes.js')
  const { WORKFLOWS, workflowCost } = await import('../src/workflows.js')
  assert.equal(RECIPES.length, WORKFLOWS.length)
  for (const r of RECIPES) assert.equal(recipeCost(r.id), workflowCost(r.workflow))
  assert.match(recipeIssue('wf-weather', { text: '', photos: {} }), /Ajoutez/)
  assert.match(recipeIssue('wf-weather', { text: '', photos: { image_urls: 1 } }), /météo/i)
  assert.equal(recipeIssue('wf-weather', { text: 'pluie', photos: { image_urls: 1 } }), null)
  assert.equal(recipeIssue('wf-photo-to-video', { photos: { person1: 1, person2: 1 } }), null)
  assert.equal(recipeIssue('wf-kling-multi-shot-creator', { text: 'idée' }), null)
})

test('workflows fal : champs, prix et contrôle des entrées', async () => {
  const { WORKFLOWS, workflowCost, workflowInputIssue } = await import('../src/workflows.js')
  assert.equal(new Set(WORKFLOWS.map((w) => w.id)).size, WORKFLOWS.length)
  for (const w of WORKFLOWS) {
    assert.match(w.endpoint, /^workflows\/[\w-]+\/[\w-]+$/)
    assert.ok(workflowCost(w) > 0)
  }
  const weather = WORKFLOWS.find((w) => w.id === 'weather')
  assert.equal(workflowInputIssue(weather, { image_urls: ['a'], weather: 'pluie' }), null)
  assert.equal(workflowInputIssue(weather, { image_urls: ['a'], weather: ' ' }), 'missing_weather')
  assert.equal(workflowInputIssue(weather, { image_urls: [], weather: 'pluie' }), 'missing_image_urls')
  assert.equal(workflowInputIssue(weather, { image_urls: ['a', 'b'], weather: 'pluie' }), 'missing_image_urls')
  const p2v = WORKFLOWS.find((w) => w.id === 'photo-to-video')
  assert.equal(workflowInputIssue(p2v, { person1: 'a' }), 'missing_person2')
  assert.equal(workflowInputIssue(WORKFLOWS.find((w) => w.id === 'fan-cam'), { image_urls: ['a'] }), null) // détails facultatifs
})
