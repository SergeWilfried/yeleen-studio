import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VIDEO_MODELS, findModel, videoCost } from '@studio/catalog'
import { buildInput } from '../src/inputs.js'
import { priceJob } from '../src/pricing.js'

const m = (id) => findModel(VIDEO_MODELS, id)
const F = 'https://v3b.fal.media/files/b/abc/x.png'
const A = 'https://v3b.fal.media/files/b/abc/x.mp3'
const base = { kind: 'video', plans: [{ text: 'Une caméra tourne autour du produit', dur: 6 }], secs: 6, sound: true }

test('LTX image vers vidéo : champs du schéma, caméra seulement si le modèle l’accepte', () => {
  const i = buildInput('video', m('ltx-2-5-fast'), { ...base, resolution: '720p', fps: 25, ratio: 'auto', camera: 'dolly_in', startImageUrl: F })
  assert.deepEqual(i, { prompt: 'Une caméra tourne autour du produit', image_url: F, duration: 6, resolution: '720p', fps: 25, aspect_ratio: 'auto', generate_audio: true, camera_motion: 'dolly_in' })
  const pro = buildInput('video', m('ltx-2-3-pro'), { ...base, resolution: '1080p', fps: 25, ratio: '16:9', camera: 'dolly_in', startImageUrl: F })
  assert.equal('camera_motion' in pro, false)
})

test('LTX texte vers vidéo : pas d’image', () => {
  const i = buildInput('video', m('ltx-2-3-fast-t2v'), { ...base, resolution: '1080p', fps: 25, ratio: '16:9', startImageUrl: F })
  assert.equal('image_url' in i, false)
})

test('MiniMax H3 : résolution en majuscules, audio pour caler la bande-son', () => {
  const i = buildInput('video', m('h3-max-turbo'), { ...base, secs: 4, resolution: '768p', startImageUrl: F, audioUrl: A })
  assert.equal(i.resolution, '768P')
  assert.equal(i.target_audio_url, A)
  assert.equal(i.duration, 4)
  assert.equal(i.prompt_expansion_mode, 'balanced')
})

test('Kling : durée en texte ; plusieurs plans deviennent multi_prompt', () => {
  const one = buildInput('video', m('kling-3-pro'), { ...base, secs: 5, startImageUrl: F })
  assert.equal(one.duration, '5')
  assert.equal(one.prompt.length > 0, true)
  const multi = buildInput('video', m('kling-3-pro'), { ...base, plans: [{ text: 'A', dur: 3 }, { text: 'B', dur: 4 }], secs: 7, startImageUrl: F })
  assert.deepEqual(multi.multi_prompt, [{ prompt: 'A', duration: '3' }, { prompt: 'B', duration: '4' }])
  assert.equal('prompt' in multi, false)
})

test('audio vers vidéo : l’audio est obligatoire, le texte facultatif', () => {
  const i = buildInput('video', m('ltx-2-3-a2v'), { kind: 'video', plans: [{ text: '', dur: 5 }], secs: 5, audioUrl: A, ratio: 'auto' })
  assert.deepEqual(i, { audio_url: A, aspect_ratio: 'auto' })
  assert.equal(priceJob({ kind: 'video', modelId: 'ltx-2-3-a2v', plans: [{ text: '', dur: 5 }], secs: 5, ratio: 'auto' }).error, 'missing_audio')
  assert.equal(priceJob({ kind: 'video', modelId: 'ltx-2-3-a2v', plans: [{ text: '', dur: 5 }], secs: 5, ratio: 'auto', audioUrl: A }).ok, true)
})

test('le prix serveur d’une vidéo suit le catalogue', () => {
  const r = priceJob({ ...base, modelId: 'ltx-2-5-fast', resolution: '720p', fps: 25, ratio: 'auto', startImageUrl: F })
  assert.equal(r.cost, videoCost(m('ltx-2-5-fast'), 6, '720p'))
})

test('options refusées : durée, résolution, fréquence, image manquante, plans multiples, adresse étrangère', () => {
  const ok = { ...base, modelId: 'ltx-2-5-fast', resolution: '720p', fps: 25, ratio: 'auto', startImageUrl: F }
  assert.equal(priceJob({ ...ok, secs: 7 }).error, 'invalid_duration')
  assert.equal(priceJob({ ...ok, resolution: '480p' }).error, 'unsupported_resolution')
  assert.equal(priceJob({ ...ok, fps: 30 }).error, 'unsupported_fps')
  assert.equal(priceJob({ ...ok, startImageUrl: undefined }).error, 'missing_start_image')
  assert.equal(priceJob({ ...ok, plans: [{ text: 'a', dur: 3 }, { text: 'b', dur: 3 }] }).error, 'single_plan_only')
  assert.equal(priceJob({ ...ok, startImageUrl: 'https://evil.example/x.png' }).error, 'invalid_file_url')
  assert.equal(priceJob({ ...ok, plans: [{ text: ' ', dur: 6 }] }).error, 'invalid_text')
})

test('Kling : les éléments cités deviennent des images frontales ou des vidéos', () => {
  const i = buildInput('video', m('kling-3-pro'), { ...base, startImageUrl: F, elements: [{ kind: 'image', url: F }, { kind: 'video', url: 'https://v3b.fal.media/files/b/abc/v.mp4' }] })
  assert.deepEqual(i.elements, [{ frontal_image_url: F }, { video_url: 'https://v3b.fal.media/files/b/abc/v.mp4' }])
  assert.equal('elements' in buildInput('video', m('kling-3-pro'), { ...base, startImageUrl: F }), false)
})

test('éléments : refusés hors Kling, au-delà de quatre, ou depuis une adresse étrangère', () => {
  const kling = { ...base, modelId: 'kling-3-pro', secs: 5, startImageUrl: F }
  assert.equal(priceJob({ ...kling, elements: [{ kind: 'image', url: F }] }).ok, true)
  assert.equal(priceJob({ ...kling, elements: Array(5).fill({ kind: 'image', url: F }) }).error, 'invalid_elements')
  assert.equal(priceJob({ ...kling, elements: [{ kind: 'image', url: 'https://evil.example/x.png' }] }).error, 'invalid_elements')
  assert.equal(priceJob({ ...kling, elements: [{ kind: 'audio', url: F }] }).error, 'invalid_elements')
  const ltx = { ...base, modelId: 'ltx-2-5-fast', resolution: '720p', fps: 25, ratio: 'auto', startImageUrl: F, elements: [{ kind: 'image', url: F }] }
  assert.equal(priceJob(ltx).error, 'elements_unsupported')
})

// --- Seedance 2.5 -----------------------------------------------------------
import { endpointFor } from '../src/inputs.js'
const seed = m('seedance-2-5')
const V = 'https://v3b.fal.media/files/b/abc/v.mp4'
const SB = { kind: 'video', modelId: 'seedance-2-5', plans: [{ text: 'Un plan large', dur: 5 }], secs: 5, resolution: '720p', ratio: 'auto', sound: true }

test('Seedance : le point d’accès dépend de ce que l’on fournit', () => {
  assert.equal(endpointFor(seed, SB), 'bytedance/seedance-2.5/us/text-to-video')
  assert.equal(endpointFor(seed, { ...SB, startImageUrl: F }), 'bytedance/seedance-2.5/us/image-to-video')
  assert.equal(endpointFor(seed, { ...SB, references: [{ kind: 'image', url: F }] }), 'bytedance/seedance-2.5/us/reference-to-video')
  assert.equal(endpointFor(seed, { ...SB, startImageUrl: F, audioUrl: A }), 'bytedance/seedance-2.5/us/reference-to-video')
  assert.equal(endpointFor(m('kling-3-pro'), SB), 'fal-ai/kling-video/v3/pro/image-to-video')
})

test('Seedance texte et image : champs du schéma', () => {
  const t = buildInput('video', seed, { ...SB, endUserId: 'demo' })
  assert.deepEqual(t, { prompt: 'Un plan large', resolution: '720p', aspect_ratio: 'auto', duration: '5', generate_audio: true, end_user_id: 'demo' })
  const i = buildInput('video', seed, { ...SB, startImageUrl: F, endImageUrl: F })
  assert.equal(i.image_url, F)
  assert.equal(i.end_image_url, F)
  assert.equal('image_urls' in i, false)
})

test('Seedance références : numérotation par type, départ, fin et audio passent après', () => {
  const i = buildInput('video', seed, { ...SB, references: [{ kind: 'image', url: 'https://v3b.fal.media/files/b/1/a.png' }, { kind: 'video', url: V }, { kind: 'image', url: 'https://v3b.fal.media/files/b/1/b.png' }, { kind: 'audio', url: A }], startImageUrl: F, audioUrl: 'https://v3b.fal.media/files/b/1/z.mp3' })
  assert.deepEqual(i.image_urls, ['https://v3b.fal.media/files/b/1/a.png', 'https://v3b.fal.media/files/b/1/b.png', F])
  assert.deepEqual(i.video_urls, [V])
  assert.deepEqual(i.audio_urls, [A, 'https://v3b.fal.media/files/b/1/z.mp3'])
  assert.equal(i.task, 'reference')
})

test('Seedance modifier : la durée devient « auto »', () => {
  const i = buildInput('video', seed, { ...SB, secs: 8, task: 'editing', references: [{ kind: 'video', url: V }] })
  assert.equal(i.duration, 'auto')
  assert.equal(i.task, 'editing')
  assert.equal(buildInput('video', seed, { ...SB, task: 'extension', references: [{ kind: 'video', url: V }] }).duration, '5')
})

test('Seedance : prix au jeton, et les vidéos de référence s’ajoutent à tarif réduit', () => {
  const plain = priceJob(SB)
  assert.equal(plain.cost, videoCost(seed, 5, '720p'))
  // la durée annoncée par le client n'est pas crue : le pire cas (30,2 s) est toujours compté
  const worst = videoCost(seed, 5, '720p', { inputSecs: 30.2 })
  const withVideo = priceJob({ ...SB, references: [{ kind: 'video', url: V }], inputSecs: 10 })
  assert.equal(withVideo.cost, worst)
  assert.ok(withVideo.cost > plain.cost)
  assert.equal(priceJob({ ...SB, references: [{ kind: 'video', url: V }] }).cost, worst)
  assert.equal(priceJob({ ...SB, references: [{ kind: 'video', url: V }], inputSecs: 1.8 }).cost, worst)
  assert.equal(priceJob({ ...SB, references: [{ kind: 'video', url: V }], inputSecs: 999 }).cost, worst)
})

test('Seedance : une modification est facturée à la durée maximale, quelle que soit celle annoncée', () => {
  const edit = (secs) => priceJob({ ...SB, task: 'editing', secs, references: [{ kind: 'video', url: V }], inputSecs: 2 })
  assert.equal(edit(4).cost, videoCost(seed, seed.caps.duration.max, '720p', { inputSecs: 30.2 }))
  assert.equal(edit(4).cost, edit(30).cost)
  assert.equal(edit(40).error, 'invalid_duration')
})

test('Seedance : limites et tâches', () => {
  const imgs = (n) => Array.from({ length: n }, () => ({ kind: 'image', url: F }))
  assert.equal(priceJob({ ...SB, references: imgs(30) }).ok, true)
  assert.equal(priceJob({ ...SB, references: imgs(31) }).error, 'too_many_references')
  assert.equal(priceJob({ ...SB, references: [{ kind: 'image', url: 'https://evil.example/a.png' }] }).error, 'invalid_references')
  assert.equal(priceJob({ ...SB, task: 'extension' }).error, 'task_needs_video')
  assert.equal(priceJob({ ...SB, task: 'editing', references: imgs(1) }).error, 'task_needs_video')
  assert.equal(priceJob({ ...SB, task: 'extension', references: [{ kind: 'video', url: V }], inputSecs: 6 }).ok, true)
  assert.equal(priceJob({ ...SB, secs: 3 }).error, 'invalid_duration')
  assert.equal(priceJob({ ...SB, secs: 31 }).error, 'invalid_duration')
  assert.equal(priceJob({ ...SB, secs: 5.5 }).error, 'invalid_duration')
  assert.equal(priceJob({ ...SB, resolution: '4K' }).error, 'unsupported_resolution')
  assert.equal(priceJob({ ...m('ltx-2-5-fast') && { ...SB, modelId: 'ltx-2-5-fast', resolution: '720p', fps: 25, secs: 6, plans: [{ text: 'a', dur: 6 }], startImageUrl: F }, references: [{ kind: 'image', url: F }] }).error, 'references_unsupported')
  // un modèle de texte seul n'exige pas d'image ; Seedance accepte un prompt vide si des références sont jointes
  assert.equal(priceJob({ ...SB, plans: [{ text: '', dur: 5 }], references: imgs(1) }).ok, true)
  assert.equal(priceJob({ ...SB, plans: [{ text: '', dur: 5 }] }).error, 'invalid_text')
})

test('Les prix du catalogue suivent fal (relevés du 17 oct. 2026)', async () => {
  const { findModel, IMAGE_MODELS } = await import('@studio/catalog')
  assert.equal(findModel(IMAGE_MODELS, 'flux-3').price.usd, 0.048)
  assert.equal(m('h3-max').price.usd, 0.0325)
  assert.equal(m('h3-max-turbo').price.usd, 0.01625)
  assert.deepEqual(seed.price.byRes, { '480p': 0.2205, '720p': 0.473, '1080p': 1.164 })
})
