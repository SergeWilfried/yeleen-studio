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
    for (const m of list) assert.ok(m.price && (m.provider === 'runware' ? /^[a-z]+:[\w.-]+@[\w.-]+$/.test(m.air) : m.endpoint), m.id)
  }
})

test('Runware : le son et une vidéo en entrée changent le prix ; sans précision, le tarif le plus haut', () => {
  const kling = findModel(VIDEO_MODELS, 'kling-3-pro')
  assert.equal(videoCost(kling, 5, undefined), toJetons(0.168 * 5))
  assert.equal(videoCost(kling, 5, undefined, { sound: false }), toJetons(0.112 * 5))
  const veo = findModel(VIDEO_MODELS, 'veo-3-1-lite')
  assert.equal(videoCost(veo, 8, '720p', { sound: false }), toJetons(0.03 * 8))
  assert.equal(videoCost(veo, 8, '1080p'), toJetons(0.08 * 8))
  const seed = findModel(VIDEO_MODELS, 'seedance-2-5')
  assert.equal(videoCost(seed, 5, '480p'), toJetons(0.102 * 5))
  assert.equal(videoCost(seed, 5, '480p', { sound: false }), videoCost(seed, 5, '480p')) // Seedance : même prix avec ou sans son
  assert.equal(videoCost(seed, 5, '720p', { inputSecs: 30.2 }), toJetons(0.295 * 5)) // tarif « vidéo en entrée », durée produite seule
})

test('chaînes : les modèles Runware y gardent leur point d’accès et leur prix fal, ou n’y figurent pas', async () => {
  const { ENTRIES } = await import('../src/chainDefs.js')
  const vid = (id) => ENTRIES.find((e) => e.id === `vid:${id}`)?.model
  assert.equal(vid('kling-3-pro').endpoint, 'fal-ai/kling-video/v3/pro/image-to-video')
  assert.equal(vid('seedance-2-5').price.byRes['720p'], 0.473)
  assert.equal(vid('veo-3-1-lite'), undefined)
  assert.equal(vid('kling-3-std'), undefined)
  for (const e of ENTRIES) assert.ok(e.model.endpoint, e.id)
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
