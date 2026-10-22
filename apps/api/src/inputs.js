/**
 * Entrée envoyée à fal pour chaque modèle. Les champs viennent des schémas OpenAPI publiés par fal
 * (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=…) ; on n'envoie que ce que le modèle accepte.
 */
import { splitLines } from '@studio/catalog/workflows'

const joinPrompt = (req) => [req.prompt?.trim(), req.styleHint, req.brandStyle].filter(Boolean).join(', ')
const ratio = (r) => (!r || r === 'Auto' ? 'auto' : r)

/** Les champs d'un workflow : textes nettoyés, et chaque champ `lines` réparti sur les entrées que fal attend. */
function workflowInput(model, inputs) {
  const out = {}
  for (const f of model.inputs) {
    const v = inputs[f.key]
    if (v == null || v === '') continue
    if (f.type === 'lines') Object.assign(out, f.expand(splitLines(v)))
    else out[f.key] = f.type === 'text' ? v.trim() : v
  }
  return out
}

export function buildInput(kind, model, req) {
  if (kind === 'workflow') return workflowInput(model, req.inputs ?? {})
  if (kind === 'tryon') return { model_image: req.modelImageUrl, garment_image: req.garmentImageUrl, num_samples: 1, output_format: 'png' }
  if (kind === 'image') {
    const prompt = joinPrompt(req)
    const res = req.resolution ?? model.caps.resolutions[0]
    if (model.id === 'flux-3') {
      return { prompt, aspect_ratio: ratio(req.ratio), resolution: res.toLowerCase(), output_format: 'png' }
    }
    // Nano Banana (Pro et 2) : même schéma
    return { prompt, num_images: Math.min(Math.max(1, req.count ?? 1), model.caps.maxImages), aspect_ratio: ratio(req.ratio), resolution: res, output_format: 'png' }
  }
  if (kind === 'audio') {
    const has = (p) => model.caps.params.includes(p)
    const input = { text: req.prompt.trim(), voice: req.voice ?? 'Rachel' }
    if (has('stability') && req.stability != null) input.stability = req.stability
    if (has('language') && req.language && req.language !== 'auto') input.language_code = req.language
    if (has('normalization') && req.normalization) input.apply_text_normalization = req.normalization
    if (has('timestamps') && req.timestamps) input.timestamps = true
    return input
  }
  if (kind === 'video') return videoInput(model, req)
  throw new Error(`type non pris en charge : ${kind}`)
}

/** Fichiers produits, au même format quel que soit le modèle : [{ url, contentType, width?, height? }]. */
/**
 * Un workflow rend les champs de son nœud de sortie : on ne connaît pas leur forme à l'avance, on cherche donc tous les fichiers
 * (objets avec une adresse et un type de média ou un nom de fichier), vidéos d'abord.
 */
export function workflowFiles(result) {
  const found = []
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (x && typeof x === 'object') {
      if (typeof x.url === 'string' && /^https:\/\//.test(x.url) && (x.content_type || x.file_name)) found.push({ url: x.url, contentType: x.content_type ?? (/\.mp4(\?|$)/.test(x.url) ? 'video/mp4' : undefined), width: x.width, height: x.height })
      else Object.values(x).forEach(walk)
    }
  }
  walk(result)
  const rank = (f) => (/^video/.test(f.contentType ?? '') ? 0 : /^image/.test(f.contentType ?? '') ? 1 : 2)
  return [...new Map(found.map((f) => [f.url, f])).values()].sort((a, b) => rank(a) - rank(b))
}

export function outputsOf(kind, result) {
  const file = (f) => ({ url: f.url, contentType: f.content_type, width: f.width, height: f.height })
  if (kind === 'image' || kind === 'tryon') return (result.images ?? []).map(file)
  if (kind === 'workflow') return workflowFiles(result)
  if (kind === 'audio') return result.audio ? [file(result.audio)] : []
  if (kind === 'video') return result.video ? [file(result.video)] : []
  return []
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))

/**
 * Vidéo : un schéma par famille de modèle (lus dans les OpenAPI de fal). `req.plans` : [{ text, dur }] ; `req.secs` : durée totale.
 * Les images et l'audio d'entrée sont des adresses du stockage de fal (voir POST /uploads).
 */

/** Le point d'accès d'un modèle : chez fal, son endpoint ; chez Runware, son identifiant (AIR). */
export const endpointFor = (model) => (model.provider === 'runware' ? model.air : model.endpoint)

function videoInput(model, req) {
  const text = [req.plans.map((p) => p.text.trim()).filter(Boolean).join(' '), req.brandStyle].filter(Boolean).join(', ')
  const secs = req.secs
  const res = req.resolution
  const sound = req.sound !== false

  if (model.id === 'h3-max' || model.id === 'h3-max-turbo') {
    return clean({
      prompt: text,
      prompt_expansion_mode: 'balanced',
      image_url: req.startImageUrl,
      end_image_url: req.endImageUrl,
      target_audio_url: req.audioUrl,
      resolution: res?.toUpperCase(), // « 768p » → « 768P »
      duration: secs,
    })
  }
  if (model.id === 'ltx-2-3-a2v') {
    return clean({ audio_url: req.audioUrl, image_url: req.startImageUrl, prompt: text || undefined, aspect_ratio: req.ratio })
  }
  // LTX 2.3 et 2.5 : image vers vidéo ou texte vers vidéo
  return clean({
    prompt: text,
    image_url: model.caps.startFrame === 'none' ? undefined : req.startImageUrl,
    end_image_url: model.caps.endFrame ? req.endImageUrl : undefined,
    duration: secs,
    resolution: res,
    fps: req.fps,
    aspect_ratio: req.ratio,
    generate_audio: sound,
    camera_motion: model.caps.cameraMotion && req.camera && req.camera !== 'none' ? req.camera : undefined,
  })
}

/**
 * Runware (modèles du catalogue avec `provider: 'runware'`) : un format commun (`positivePrompt`, `duration`, `inputs.*`, `settings`,
 * `providerSettings`) et des règles propres à chaque modèle, lues dans https://runware.ai/docs/models/<modèle> (« Compatibility &
 * Validation »). Les fichiers d'entrée restent des adresses du stockage de fal (POST /uploads) : Runware les télécharge.
 */
// Dimensions acceptées par format et résolution (Seedance 2.5 ; Veo 3.1 Lite n'en garde que 16:9 et 9:16 en 720p et 1080p).
const DIMS = {
  '480p': { '21:9': [992, 432], '16:9': [854, 480], '4:3': [752, 560], '1:1': [640, 640], '3:4': [560, 752], '9:16': [480, 854] },
  '720p': { '21:9': [1470, 630], '16:9': [1280, 720], '4:3': [1112, 834], '1:1': [960, 960], '3:4': [834, 1112], '9:16': [720, 1280] },
  '1080p': { '21:9': [2206, 946], '16:9': [1920, 1080], '4:3': [1664, 1248], '1:1': [1440, 1440], '3:4': [1248, 1664], '9:16': [1080, 1920] },
}
const size = (res, r) => { const d = DIMS[res]?.[r]; return d ? { width: d[0], height: d[1] } : {} }
const frames = (start, end) => [start && { image: start, frame: 'first' }, end && { image: end, frame: 'last' }].filter(Boolean)
const listOrNone = (a) => (a.length ? a : undefined)

/**
 * Seedance 2.5 : texte seul, images de départ et de fin (`frameImages`), références (« @Image1 », « @Video1 », « @Audio1 » dans le
 * prompt, dans l'ordre de `references` ; l'image de départ, l'image de fin et l'audio fournis à part passent après), ou une vidéo à
 * modifier ou prolonger (`inputs.video`, la première vidéo citée). `frameImages` ne se combine pas avec des références, et un format
 * choisi (`width`/`height`) ne se combine ni avec `resolution` ni avec des images de départ ou une vidéo source.
 */
function seedanceRunware(req, text) {
  const refs = req.references ?? []
  const of = (k) => refs.filter((r) => r.kind === k).map((r) => r.url)
  const task = req.task ?? 'reference'
  const base = { positivePrompt: text || undefined, duration: Math.round(req.secs), settings: { audio: req.sound !== false } }
  const images = [...of('image'), req.startImageUrl, req.endImageUrl].filter(Boolean)
  const audios = [...of('audio'), req.audioUrl].filter(Boolean)
  if (task === 'editing' || task === 'extension') {
    const [video, ...others] = of('video')
    return clean({
      ...base,
      duration: task === 'editing' ? 'auto' : base.duration, // une modification dure autant que la vidéo source
      resolution: req.resolution,
      settings: { ...base.settings, operation: task === 'editing' ? 'edit' : 'extend' },
      inputs: clean({ video, referenceVideos: listOrNone(others), referenceImages: listOrNone(images), referenceAudios: listOrNone(audios) }),
    })
  }
  const hasRefs = refs.length > 0 || Boolean(req.audioUrl)
  if (!hasRefs && (req.startImageUrl || req.endImageUrl)) return clean({ ...base, resolution: req.resolution, inputs: { frameImages: frames(req.startImageUrl, req.endImageUrl) } })
  const sized = req.ratio && req.ratio !== 'auto' ? size(req.resolution, req.ratio) : { resolution: req.resolution }
  if (!hasRefs) return clean({ ...base, ...sized })
  return clean({ ...base, ...sized, inputs: clean({ referenceImages: listOrNone(images), referenceVideos: listOrNone(of('video')), referenceAudios: listOrNone(audios) }) })
}

/**
 * Kling 3.0 (Pro et Standard) : image vers vidéo, avec image de fin, personnages et objets (`inputs.elements`, cités dans le prompt
 * par « <<<element_1>>> » : on traduit nos « @Element1 ») et plusieurs plans (`multiPrompt`, qui remplace `positivePrompt`).
 * Un élément image demande une image de face et au moins une image : on donne la même.
 */
function klingRunware(req, text) {
  const cite = (t) => t.replace(/@Element(\d+)/g, '<<<element_$1>>>')
  const multi = req.plans.length > 1
  const elements = (req.elements ?? []).map((e, i) => {
    const head = { id: `element_${i + 1}`, description: `Élément ${i + 1}` }
    return e.kind === 'video' ? { ...head, videos: [e.url] } : { ...head, frontalImage: e.url, images: [e.url] }
  })
  return clean({
    positivePrompt: multi ? undefined : cite(text),
    duration: Math.round(req.secs),
    inputs: clean({ frameImages: frames(req.startImageUrl, req.endImageUrl), elements: listOrNone(elements) }),
    providerSettings: { klingai: clean({ sound: req.sound !== false, multiPrompt: multi ? req.plans.map((p) => ({ prompt: cite(p.text.trim()), duration: Math.round(p.dur) })) : undefined }) },
  })
}

/** Veo 3.1 Lite : sans image, un format (`width`/`height`) ; avec une image de départ ou de fin, `resolution` et le format de l'image. */
function veoRunware(req, text) {
  const fr = frames(req.startImageUrl, req.endImageUrl)
  return clean({
    positivePrompt: text,
    duration: req.secs,
    ...(fr.length ? { resolution: req.resolution } : size(req.resolution, req.ratio ?? '16:9')),
    inputs: fr.length ? { frameImages: fr } : undefined,
    providerSettings: { google: { generateAudio: req.sound !== false } },
  })
}

/** Tâche `videoInference` envoyée à Runware pour un modèle du catalogue servi par Runware (sans `taskType` ni `taskUUID`). */
export function runwareInput(model, req) {
  const text = [req.plans.map((p) => p.text.trim()).filter(Boolean).join(' '), req.brandStyle].filter(Boolean).join(', ')
  const build = model.id === 'seedance-2-5' ? seedanceRunware : model.id.startsWith('kling-3') ? klingRunware : model.id === 'veo-3-1-lite' ? veoRunware : null
  if (!build) throw new Error(`modèle Runware sans entrée : ${model.id}`)
  return { model: model.air, ...build(req, text) }
}
