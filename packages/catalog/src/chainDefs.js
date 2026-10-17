import { AUDIO_MODELS, EXTEND_MODEL, IMAGE_MODELS, VIDEO_MODELS, durationOptions, imageCost, videoCost, voiceCost } from './models.js'

/**
 * Chaînes : plusieurs modèles reliés, la sortie d'une étape alimentant la suivante.
 * Côté fal, une chaîne est un workflow : un nœud `input`, un nœud `run` par étape (champ `app` = endpoint,
 * `depends` = étape précédente, `input` qui référence la sortie amont, ex. `$node_1.images.0.url`) et un nœud `output`.
 * `workflowJson` produit cette définition ; elle s'exécute avec fal.stream('workflows/execute', …).
 */

const videoTakes = (m) => (m.caps.audioRef === 'required' ? ['audio'] : m.caps.startFrame === 'required' ? ['image'] : m.caps.startFrame === 'none' ? ['text'] : ['text', 'image'])

/** Toutes les étapes possibles : un modèle, ce qu'il produit (kind) et ce qu'il accepte en entrée (takes). */
export const ENTRIES = [
  ...IMAGE_MODELS.map((m) => ({ id: `img:${m.id}`, kind: 'image', takes: ['text'], model: m })),
  ...VIDEO_MODELS.map((m) => ({ id: `vid:${m.id}`, kind: 'video', takes: videoTakes(m), model: m })),
  { id: 'vid:extend', kind: 'video', takes: ['video'], model: EXTEND_MODEL },
  ...AUDIO_MODELS.map((m) => ({ id: `aud:${m.id}`, kind: 'audio', takes: ['text'], model: m })),
]
export const entryById = (id) => ENTRIES.find((e) => e.id === id)
/** Étapes qui peuvent suivre une sortie de ce type (ou ouvrir une chaîne à partir d'un asset de ce type). */
export const choicesAfter = (kind) => ENTRIES.filter((e) => e.takes.includes(kind))
export const firstChoices = ENTRIES.filter((e) => e.takes.includes('text'))

let n = 0
export const stepUid = () => `s${Date.now().toString(36)}${++n}`

export function newStep(entryId, overrides = {}) {
  const e = entryById(entryId)
  const m = e.model
  let res = null
  let secs = null
  if (e.kind === 'image') res = m.caps.resolutions.includes('2K') ? '2K' : m.caps.resolutions[0]
  if (e.kind === 'video' && e.id !== 'vid:extend') {
    res = m.caps.resolutions ? (m.caps.resolutions.includes('768p') ? '768p' : m.caps.resolutions[0]) : null
    secs = m.caps.duration.fromAudio ? null : durationOptions(m.caps, res, 25)[0] ?? 5
  }
  if (e.id === 'vid:extend') secs = 5
  return { uid: stepUid(), entryId, prompt: '', secs, res, ...overrides }
}

export const stepDurations = (step) => {
  const e = entryById(step.entryId)
  const d = e.model.caps.duration
  return !d || d.fromAudio ? [] : durationOptions(e.model.caps, step.res, 25) // images et voix n'ont pas de durée à régler
}

/** Durée estimée de la voix : 1 s pour environ 14 caractères. */
const voiceSecs = (text) => Math.max(2, Math.round(Math.max(text.length, 60) / 14))

export function stepCost(step) {
  const e = entryById(step.entryId)
  if (e.kind === 'image') return imageCost(e.model, step.res, 1)
  if (e.kind === 'audio') return voiceCost(e.model, Math.max(step.prompt.length, 120))
  if (e.id === 'vid:extend') return videoCost(EXTEND_MODEL, step.secs)
  if (e.model.caps.duration?.fromAudio) return videoCost(e.model, 5, step.res) // durée de l'audio de l'étape précédente : estimée à 5 s
  return videoCost(e.model, step.secs, step.res)
}
export const chainCost = (steps) => Math.round(steps.reduce((s, st) => s + stepCost(st), 0) * 10) / 10

/** Durée en secondes enregistrée sur l'asset produit par une étape. */
export const stepSecs = (step) => {
  const e = entryById(step.entryId)
  if (e.kind === 'audio') return voiceSecs(step.prompt)
  if (e.kind === 'video') return step.secs ?? 5
  return null
}

/** Pourquoi une étape n'est pas prête (ou null). */
export function stepIssue(step, i, hasInputAsset) {
  const e = entryById(step.entryId)
  const needsPrompt = e.id !== 'vid:extend'
  if (needsPrompt && !step.prompt.trim()) return i === 0 && hasInputAsset ? `Décrivez l’étape ${i + 1}.` : e.kind === 'audio' ? `Écrivez le texte de l’étape ${i + 1}.` : `Décrivez l’étape ${i + 1}.`
  return null
}

// Champs d'entrée et de sortie des endpoints (lus dans leurs schémas fal).
const io = (e) => ({
  out: e.kind === 'image' ? 'images.0.url' : e.kind === 'audio' ? 'audio.url' : 'video.url',
  text: e.kind === 'audio' ? 'text' : 'prompt',
  from: { image: e.model.id === 'kling-3-pro' ? 'start_image_url' : 'image_url', audio: 'audio_url', video: 'video_url' },
})

/** Définition de workflow fal (objet), prête pour `workflows/execute`. */
export function workflowJson(steps, { inputAsset = null } = {}) {
  const nodes = { input: { id: 'input', type: 'input', depends: [], input: inputAsset ? { asset_url: '' } : { prompt: '' } } }
  steps.forEach((st, i) => {
    const e = entryById(st.entryId)
    const m = io(e)
    const id = `node_${i + 1}`
    const prev = i === 0 ? null : entryById(steps[i - 1].entryId)
    const input = {}
    if (i === 0 && !inputAsset) input[m.text] = '$input.prompt'
    else if (st.prompt.trim() || e.kind === 'audio') input[m.text] = st.prompt
    if (i === 0 && inputAsset) input[m.from[inputAsset.kind]] = '$input.asset_url'
    if (i > 0) input[m.from[prev.kind]] = `$node_${i}.${io(prev).out}`
    if (st.secs) input.duration = st.secs
    nodes[id] = { id, type: 'run', depends: [i === 0 ? 'input' : `node_${i}`], app: e.model.endpoint, input }
  })
  const last = steps[steps.length - 1]
  const lastEntry = entryById(last.entryId)
  nodes.output = { id: 'output', type: 'display', depends: [`node_${steps.length}`], fields: { [lastEntry.kind]: `$node_${steps.length}.${io(lastEntry).out}` } }
  return nodes
}

export const TEMPLATES = [
  {
    id: 'img-vid',
    name: 'Image animée',
    steps: [
      { entryId: 'img:nano-banana-pro', prompt: 'Portrait de studio, lumière douce, fond neutre' },
      { entryId: 'vid:ltx-2-5-fast', prompt: 'Léger mouvement de caméra vers l’avant, le regard se tourne vers l’objectif', secs: 6 },
    ],
  },
  {
    id: 'voice-vid',
    name: 'Voix illustrée',
    steps: [
      { entryId: 'aud:eleven-v3', prompt: 'Bonjour et bienvenue. Aujourd’hui, nous allons créer notre première vidéo ensemble.' },
      { entryId: 'vid:ltx-2-3-a2v', prompt: 'Une présentatrice face caméra, lumière chaleureuse, décor de studio' },
    ],
  },
  {
    id: 'clip-ext',
    name: 'Plan prolongé',
    steps: [
      { entryId: 'vid:ltx-2-3-fast-t2v', prompt: 'Drone au-dessus d’une côte au lever du jour, brume légère', secs: 6 },
      { entryId: 'vid:extend', prompt: 'La caméra continue d’avancer vers l’horizon', secs: 8 },
    ],
  },
  {
    id: 'spot',
    name: 'Spot en trois temps',
    steps: [
      { entryId: 'img:nano-banana-pro', prompt: 'Flacon de parfum posé sur du marbre noir, reflets dorés' },
      { entryId: 'vid:ltx-2-5-fast', prompt: 'Rotation lente autour du flacon, lumière qui glisse sur le verre', secs: 6 },
      { entryId: 'vid:extend', prompt: 'La caméra recule pour révéler tout le décor', secs: 8 },
    ],
  },
]

/** Étape de départ proposée quand une chaîne démarre à partir d'un asset de la bibliothèque. */
export const STARTERS = {
  image: { entryId: 'vid:ltx-2-5-fast', prompt: 'Léger mouvement de caméra, la scène prend vie', secs: 6 },
  video: { entryId: 'vid:extend', prompt: '', secs: 8 },
  audio: { entryId: 'vid:ltx-2-3-a2v', prompt: 'Une présentatrice face caméra, lumière chaleureuse' },
}

export const draftFromTemplate = (t) => ({ id: null, name: t.name, inputAssetId: null, steps: t.steps.map((s) => newStep(s.entryId, s)) })
