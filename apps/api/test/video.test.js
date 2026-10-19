import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VIDEO_MODELS, findModel, videoCost } from '@studio/catalog'
import { buildInput, runwareInput } from '../src/inputs.js'
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

test('Kling (Runware) : durée entière, son, image de départ et de fin ; plusieurs plans deviennent multiPrompt', () => {
  const one = runwareInput(m('kling-3-pro'), { ...base, secs: 5, startImageUrl: F, endImageUrl: A })
  assert.deepEqual(one, {
    model: 'klingai:kling-video@3-pro', positivePrompt: 'Une caméra tourne autour du produit', duration: 5,
    inputs: { frameImages: [{ image: F, frame: 'first' }, { image: A, frame: 'last' }] }, providerSettings: { klingai: { sound: true } },
  })
  const multi = runwareInput(m('kling-3-std'), { ...base, plans: [{ text: 'Plan A', dur: 3 }, { text: 'Plan B', dur: 4 }], secs: 7, sound: false, startImageUrl: F })
  assert.equal(multi.model, 'klingai:kling-video@3-standard')
  assert.deepEqual(multi.providerSettings.klingai, { sound: false, multiPrompt: [{ prompt: 'Plan A', duration: 3 }, { prompt: 'Plan B', duration: 4 }] })
  assert.equal('positivePrompt' in multi, false) // l'un ou l'autre, jamais les deux
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

test('Kling (Runware) : les éléments cités deviennent des éléments Runware, et « @Element1 » devient « <<<element_1>>> »', () => {
  const V2 = 'https://v3b.fal.media/files/b/abc/v.mp4'
  const i = runwareInput(m('kling-3-pro'), { ...base, plans: [{ text: '@Element1 tient @Element2', dur: 5 }], secs: 5, startImageUrl: F, elements: [{ kind: 'image', url: F }, { kind: 'video', url: V2 }] })
  assert.equal(i.positivePrompt, '<<<element_1>>> tient <<<element_2>>>')
  assert.deepEqual(i.inputs.elements, [
    { id: 'element_1', description: 'Élément 1', frontalImage: F, images: [F] },
    { id: 'element_2', description: 'Élément 2', videos: [V2] },
  ])
  assert.equal('elements' in runwareInput(m('kling-3-pro'), { ...base, startImageUrl: F }).inputs, false)
})

test('éléments : refusés hors Kling, au-delà de trois (Runware, avec une image de départ), ou depuis une adresse étrangère', () => {
  const kling = { ...base, modelId: 'kling-3-pro', secs: 5, startImageUrl: F }
  assert.equal(priceJob({ ...kling, elements: Array(3).fill({ kind: 'image', url: F }) }).ok, true)
  assert.equal(priceJob({ ...kling, elements: Array(4).fill({ kind: 'image', url: F }) }).error, 'invalid_elements')
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

test('point d’accès : l’identifiant Runware pour Seedance, Kling et Veo, l’endpoint fal pour les autres', () => {
  assert.equal(endpointFor(seed), 'bytedance:seedance@2.5')
  assert.equal(endpointFor(m('kling-3-pro')), 'klingai:kling-video@3-pro')
  assert.equal(endpointFor(m('veo-3-1-lite')), 'google:veo@3.1-lite')
  assert.equal(endpointFor(m('ltx-2-5-fast')), m('ltx-2-5-fast').endpoint)
})

test('Seedance (Runware) : texte (format choisi ou « auto »), puis images de départ et de fin', () => {
  assert.deepEqual(runwareInput(seed, SB), { model: 'bytedance:seedance@2.5', positivePrompt: 'Un plan large', duration: 5, settings: { audio: true }, resolution: '720p' })
  // un format choisi devient des dimensions, sans `resolution` (les deux ne se combinent pas)
  const wide = runwareInput(seed, { ...SB, ratio: '9:16', resolution: '1080p' })
  assert.deepEqual([wide.width, wide.height, 'resolution' in wide], [1080, 1920, false])
  const i = runwareInput(seed, { ...SB, ratio: '16:9', startImageUrl: F, endImageUrl: A })
  assert.deepEqual(i.inputs, { frameImages: [{ image: F, frame: 'first' }, { image: A, frame: 'last' }] })
  assert.deepEqual([i.resolution, 'width' in i], ['720p', false]) // l'image fixe le format
})

test('Seedance (Runware) références : numérotation par type ; départ, fin et audio passent après, jamais en frameImages', () => {
  const i = runwareInput(seed, { ...SB, references: [{ kind: 'image', url: 'https://v3b.fal.media/files/b/1/a.png' }, { kind: 'video', url: V }, { kind: 'image', url: 'https://v3b.fal.media/files/b/1/b.png' }, { kind: 'audio', url: A }], startImageUrl: F, audioUrl: 'https://v3b.fal.media/files/b/1/z.mp3' })
  assert.deepEqual(i.inputs, {
    referenceImages: ['https://v3b.fal.media/files/b/1/a.png', 'https://v3b.fal.media/files/b/1/b.png', F],
    referenceVideos: [V],
    referenceAudios: [A, 'https://v3b.fal.media/files/b/1/z.mp3'],
  })
  assert.equal('operation' in i.settings, false)
})

test('Seedance (Runware) modifier et prolonger : la vidéo citée devient la source ; une modification dure « auto »', () => {
  const edit = runwareInput(seed, { ...SB, secs: 8, task: 'editing', references: [{ kind: 'video', url: V }] })
  assert.deepEqual([edit.duration, edit.settings.operation, edit.inputs.video, 'referenceVideos' in edit.inputs], ['auto', 'edit', V, false])
  const ext = runwareInput(seed, { ...SB, task: 'extension', references: [{ kind: 'video', url: V }, { kind: 'video', url: F }] })
  assert.deepEqual([ext.duration, ext.settings.operation, ext.inputs.video, ext.inputs.referenceVideos], [5, 'extend', V, [F]])
})

test('Veo 3.1 Lite (Runware) : dimensions sans image, résolution avec ; son dans providerSettings.google', () => {
  const veo = m('veo-3-1-lite')
  const t = runwareInput(veo, { ...base, secs: 6, resolution: '720p', ratio: '9:16', sound: false })
  assert.deepEqual(t, { model: 'google:veo@3.1-lite', positivePrompt: 'Une caméra tourne autour du produit', duration: 6, width: 720, height: 1280, providerSettings: { google: { generateAudio: false } } })
  const i = runwareInput(veo, { ...base, secs: 8, resolution: '1080p', ratio: '16:9', startImageUrl: F })
  assert.deepEqual([i.resolution, 'width' in i, i.inputs.frameImages], ['1080p', false, [{ image: F, frame: 'first' }]])
  const ok = { ...base, modelId: 'veo-3-1-lite', secs: 8, resolution: '720p', ratio: '16:9' }
  assert.equal(priceJob(ok).cost, videoCost(veo, 8, '720p'))
  assert.equal(priceJob({ ...ok, sound: false }).cost, videoCost(veo, 8, '720p', { sound: false }))
  assert.ok(priceJob({ ...ok, sound: false }).cost < priceJob(ok).cost)
  assert.equal(priceJob({ ...ok, secs: 5 }).error, 'invalid_duration')
})

test('Seedance : une vidéo de référence fait passer au tarif « vidéo en entrée », quelle que soit la durée annoncée', () => {
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

test('Les prix du catalogue suivent les fournisseurs (fal le 17 oct. 2026, Runware le 19 oct. 2026)', async () => {
  const { findModel, IMAGE_MODELS } = await import('@studio/catalog')
  assert.equal(findModel(IMAGE_MODELS, 'flux-3').price.usd, 0.048)
  assert.equal(m('h3-max').price.usd, 0.0325)
  assert.equal(m('h3-max-turbo').price.usd, 0.01625)
  assert.deepEqual(seed.price.byRes, { '480p': 0.102, '720p': 0.23, '1080p': 0.614 })
  assert.deepEqual(seed.fal.price.byRes, { '480p': 0.2205, '720p': 0.473, '1080p': 1.164 }) // chaînes (workflows fal)
  assert.deepEqual([m('kling-3-pro').price.usd, m('kling-3-pro').price.silentUsd], [0.168, 0.112])
  assert.deepEqual([m('kling-3-std').price.usd, m('kling-3-std').price.silentUsd], [0.126, 0.084])
})
