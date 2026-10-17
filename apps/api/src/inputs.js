/**
 * Entrée envoyée à fal pour chaque modèle. Les champs viennent des schémas OpenAPI publiés par fal
 * (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=…) ; on n'envoie que ce que le modèle accepte.
 */
const joinPrompt = (req) => [req.prompt?.trim(), req.styleHint, req.brandStyle].filter(Boolean).join(', ')
const ratio = (r) => (!r || r === 'Auto' ? 'auto' : r)

export function buildInput(kind, model, req) {
  if (kind === 'workflow') return Object.fromEntries(model.inputs.filter((f) => req.inputs?.[f.key] != null && req.inputs[f.key] !== '').map((f) => [f.key, f.type === 'text' ? req.inputs[f.key].trim() : req.inputs[f.key]]))
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

/** Le point d'accès fal d'un modèle : un seul, ou l'un de trois selon ce que la demande contient (Seedance). */
export function endpointFor(model, req) {
  if (!model.endpoints) return model.endpoint
  const hasRefs = Boolean(req.references?.length || req.audioUrl)
  return model.endpoints[hasRefs ? 'reference' : req.startImageUrl || req.endImageUrl ? 'image' : 'text']
}

/**
 * Seedance 2.5. Références : « @Image1 », « @Video1 », « @Audio1 » dans le prompt, dans l'ordre de `references` pour chaque type ;
 * l'image de départ, l'image de fin et l'audio fournis à part passent après, pour ne pas décaler ces numéros.
 */
function seedanceInput(model, req) {
  const text = [req.plans.map((p) => p.text.trim()).filter(Boolean).join(' '), req.brandStyle].filter(Boolean).join(', ')
  const editing = req.task === 'editing'
  const base = { prompt: text || undefined, resolution: req.resolution, aspect_ratio: req.ratio ?? 'auto', duration: editing ? 'auto' : String(Math.round(req.secs)), generate_audio: req.sound !== false, end_user_id: req.endUserId }
  const kind = endpointFor(model, req) === model.endpoints.reference ? 'reference' : endpointFor(model, req) === model.endpoints.image ? 'image' : 'text'
  if (kind === 'text') return clean(base)
  if (kind === 'image') return clean({ ...base, image_url: req.startImageUrl ?? req.endImageUrl, end_image_url: req.startImageUrl ? req.endImageUrl : undefined })
  const refs = req.references ?? []
  const of = (k) => refs.filter((r) => r.kind === k).map((r) => r.url)
  const images = [...of('image'), req.startImageUrl, req.endImageUrl].filter(Boolean)
  const audios = [...of('audio'), req.audioUrl].filter(Boolean)
  const videos = of('video')
  return clean({ ...base, task: req.task ?? 'reference', image_urls: images.length ? images : undefined, video_urls: videos.length ? videos : undefined, audio_urls: audios.length ? audios : undefined })
}

function videoInput(model, req) {
  if (model.id === 'seedance-2-5') return seedanceInput(model, req)
  const text = [req.plans.map((p) => p.text.trim()).filter(Boolean).join(' '), req.brandStyle].filter(Boolean).join(', ')
  const secs = req.secs
  const res = req.resolution
  const sound = req.sound !== false

  if (model.id === 'kling-3-pro') {
    const multi = req.plans.length > 1
    return clean({
      start_image_url: req.startImageUrl,
      end_image_url: req.endImageUrl,
      prompt: multi ? undefined : text,
      multi_prompt: multi ? req.plans.map((p) => ({ prompt: p.text.trim(), duration: String(p.dur) })) : undefined,
      duration: String(Math.round(secs)),
      generate_audio: sound,
      // Personnages et objets cités dans le prompt par @Element1, @Element2… : une image (face) ou une vidéo.
      elements: req.elements?.length ? req.elements.map((e) => (e.kind === 'video' ? { video_url: e.url } : { frontal_image_url: e.url })) : undefined,
    })
  }
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
