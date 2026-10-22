import { AUDIO_MODELS, IMAGE_MODELS, TRYON_MODEL, VIDEO_MODELS, findModel, imageCost, tryonCost, videoCost, voiceCost } from '@studio/catalog'
import { findWorkflow, workflowCost, workflowInputIssue } from '@studio/catalog/workflows'
import { VOICES } from '@studio/catalog/voices'

const LANGS = ['auto', 'fr', 'en', 'es', 'pt', 'de', 'ar']

/**
 * Le prix d'une génération, calculé ici à partir du catalogue : le prix envoyé par l'application n'est qu'un aperçu.
 * Valide aussi les options. Retourne { ok, cost, model, count } ou { ok: false, error }.
 */
export function priceJob(req) {
  if (req.kind === 'workflow') { // workflow fal : seulement ceux de la liste, entrées contrôlées, prix du catalogue
    const w = findWorkflow(req.modelId)
    if (!w) return { ok: false, error: 'unknown_model' }
    const issue = workflowInputIssue(w, req.inputs ?? {}, (v) => typeof v === 'string' && FAL_FILE.test(v))
    if (issue) return { ok: false, error: issue.startsWith('missing_') && !['text', 'lines'].includes(w.inputs.find((f) => `missing_${f.key}` === issue)?.type) ? 'invalid_file_url' : 'invalid_text' }
    return { ok: true, model: { ...w, id: w.id }, count: 1, cost: workflowCost(w) }
  }
  if (req.kind === 'tryon') { // essayage : deux photos déposées chez fal
    if (req.modelId !== TRYON_MODEL.id) return { ok: false, error: 'unknown_model' }
    if (![req.modelImageUrl, req.garmentImageUrl].every((u) => FAL_FILE.test(u ?? ''))) return { ok: false, error: 'invalid_file_url' }
    return { ok: true, model: TRYON_MODEL, count: 1, cost: tryonCost() }
  }
  const list = { image: IMAGE_MODELS, video: VIDEO_MODELS, audio: AUDIO_MODELS }[req.kind]
  if (!list) return { ok: false, error: 'unknown_kind' }
  const model = findModel(list, req.modelId)
  if (!model || model.id !== req.modelId) return { ok: false, error: 'unknown_model' }
  if (req.kind === 'image') {
    if (!req.prompt?.trim()) return { ok: false, error: 'invalid_text' }
    const res = req.resolution ?? model.caps.resolutions[0]
    if (!model.caps.resolutions.includes(res)) return { ok: false, error: 'unsupported_resolution' }
    if (req.ratio && !model.caps.ratios.includes(req.ratio)) return { ok: false, error: 'unsupported_ratio' }
    const count = Math.min(Math.max(1, req.count ?? 1), model.caps.maxImages)
    return { ok: true, model, count, cost: imageCost(model, res, count) }
  }
  if (req.kind === 'video') return priceVideo(req, model)
  const chars = req.prompt?.trim().length ?? 0
  if (!(chars > 0)) return { ok: false, error: 'invalid_text' }
  if (req.voice && !VOICES.some((v) => v.id === req.voice)) return { ok: false, error: 'unknown_voice' }
  if (req.language && !LANGS.includes(req.language)) return { ok: false, error: 'unsupported_language' }
  return { ok: true, model, count: 1, cost: voiceCost(model, chars) }
}

const FAL_FILE = /^https:\/\/[a-z0-9.-]*fal\.media\//

function priceVideo(req, model) {
  const c = model.caps
  const plans = Array.isArray(req.plans) ? req.plans : []
  if (!plans.length || plans.length > 4 || plans.some((p) => !(p.dur > 0))) return { ok: false, error: 'invalid_plans' }
  if (plans.length > 1 && !c.multiShot) return { ok: false, error: 'single_plan_only' }

  // Références (Seedance) : images, vidéos et audio cités dans le prompt, et tâche (prolonger ou modifier une vidéo).
  const refs = Array.isArray(req.references) ? req.references : []
  if (refs.length && !c.references) return { ok: false, error: 'references_unsupported' }
  const count = (k) => refs.filter((r) => r.kind === k).length
  if (refs.some((r) => !['image', 'video', 'audio'].includes(r.kind) || !FAL_FILE.test(r.url ?? ''))) return { ok: false, error: 'invalid_references' }
  if (c.references && (count('image') > c.references.images || count('video') > c.references.videos || count('audio') > c.references.audios)) return { ok: false, error: 'too_many_references' }
  const task = req.task ?? 'reference'
  if (task !== 'reference' && (!c.tasks?.includes(task) || !count('video'))) return { ok: false, error: 'task_needs_video' }

  const needsText = c.audioRef !== 'required'
  if (needsText && !plans.some((p) => p.text?.trim()) && !refs.length) return { ok: false, error: 'invalid_text' }

  const secs = req.secs
  if (!(secs > 0)) return { ok: false, error: 'invalid_duration' }
  if (c.duration.fromAudio) {
    if (secs < c.duration.fromAudio.min || secs > c.duration.fromAudio.max) return { ok: false, error: 'invalid_duration' }
  } else if (c.duration.values) {
    if (!c.duration.values.includes(secs)) return { ok: false, error: 'invalid_duration' }
  } else if (task === 'editing') {
    if (secs > 31) return { ok: false, error: 'invalid_duration' } // durée imposée par la vidéo modifiée (fal : « auto »)
  } else if (secs < c.duration.min || secs > c.duration.max || (c.duration.integer && !Number.isInteger(secs))) return { ok: false, error: 'invalid_duration' }

  if (c.resolutions && !c.resolutions.includes(req.resolution)) return { ok: false, error: 'unsupported_resolution' }
  if (c.fps && !c.fps.includes(req.fps)) return { ok: false, error: 'unsupported_fps' }
  if (c.ratios && !c.ratios.includes(req.ratio)) return { ok: false, error: 'unsupported_ratio' }

  const files = { start: req.startImageUrl, end: req.endImageUrl, audio: req.audioUrl }
  if (c.startFrame === 'required' && !files.start) return { ok: false, error: 'missing_start_image' }
  if (c.audioRef === 'required' && !files.audio) return { ok: false, error: 'missing_audio' }
  if (Object.values(files).some((u) => u && !FAL_FILE.test(u))) return { ok: false, error: 'invalid_file_url' } // seulement des fichiers déposés chez fal via /uploads
  if (req.elements?.length) {
    if (!c.elements) return { ok: false, error: 'elements_unsupported' }
    if (req.elements.length > (c.maxElements ?? 4) || req.elements.some((e) => !['image', 'video'].includes(e.kind) || !FAL_FILE.test(e.url ?? ''))) return { ok: false, error: 'invalid_elements' }
  }

  // Vidéos de référence : elles changent le tarif (Runware : tarif « vidéo en entrée » ; fal : leur durée est aussi facturée), et une
  // modification produit une vidéo aussi longue que la source. Le serveur ne peut pas mesurer ces durées et ne croit pas celles que le
  // client annonce : il compte le pire cas (30,2 s en entrée, durée maximale en sortie pour une modification). Le prix affiché dans
  // l'interface peut donc être plus bas que le prix facturé, jamais l'inverse ; à rapprocher quand le serveur mesurera lui-même la
  // durée du fichier. Le son compte aussi quand le fournisseur facture moins cher sans (Kling 3.0, Veo 3.1 Lite).
  const inputSecs = count('video') ? 30.2 : 0
  const billedSecs = task === 'editing' ? c.duration.max : secs
  const sound = c.audio === 'always' || req.sound !== false
  return { ok: true, model, count: 1, cost: videoCost(model, billedSecs, c.resolutions ? req.resolution : undefined, { inputSecs, sound }) }
}
