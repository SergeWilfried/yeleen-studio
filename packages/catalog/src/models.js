/**
 * Catalogue curé de modèles, avec leurs capacités (ce que le modèle accepte) et leur prix.
 * L'interface se construit à partir de ces descripteurs : durées, résolutions, formats, son, images de début et de fin,
 * multi-plans, références, paramètres de voix. Aucun contrôle n'est affiché s'il n'existe pas côté modèle.
 *
 * Source : schémas d'entrée et page de prix fal.ai. `verified: true` = schéma lu en entier ; `verified: false` =
 * prix lu mais capacités à confirmer. En production, générez ces descripteurs depuis l'OpenAPI de chaque endpoint
 * (les enums `duration`, `resolution`, `aspect_ratio`, la présence de `end_image_url`, `generate_audio`, etc.).
 */

// Conversion fournisseur (USD) → jetons : 1 jeton ≈ 33 FCFA (formule Pro) ≈ 0,0556 $, avec une marge ×2.
export const JETON_USD = 0.0556
export const MARGIN = 2
export const toJetons = (usd) => Math.max(0.1, Math.round(((usd * MARGIN) / JETON_USD) * 10) / 10)

export const VIDEO_MODELS = [
  {
    id: 'kling-3-pro',
    input: 'image',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    name: 'Kling 3.0 Pro',
    tagline: 'Mouvement fluide, rendu cinéma, voix et sons intégrés',
    badge: 'TOP',
    tags: ['Audio natif', 'Multi-plans', 'Image de fin', 'Personnages'],
    price: { usd: 0.14, per: 's' },
    verified: true,
    caps: {
      duration: { min: 3, max: 15 },
      resolutions: null, // aucun paramètre : la résolution suit l'image de départ
      ratio: 'image', // le format suit l'image de départ
      audio: 'toggle', // generate_audio (activé par défaut)
      startFrame: 'required', // start_image_url obligatoire
      endFrame: true, // end_image_url
      audioRef: false,
      elements: true, // personnages et objets référencés par @Element1…
      multiShot: true, // multi_prompt : un prompt et une durée par plan
    },
  },
  {
    id: 'seedance-2-5',
    input: 'both',
    // Un seul modèle, trois points d'accès fal selon ce que l'on fournit : texte seul, image(s) de départ et de fin, ou références.
    endpoint: 'bytedance/seedance-2.5/us/image-to-video',
    endpoints: { text: 'bytedance/seedance-2.5/us/text-to-video', image: 'bytedance/seedance-2.5/us/image-to-video', reference: 'bytedance/seedance-2.5/us/reference-to-video' },
    name: 'Seedance 2.5',
    tagline: 'Références d’images, de vidéos et d’audio, durées jusqu’à 30 s',
    badge: 'TOP',
    tags: ['Références', 'Audio natif', 'Jusqu’à 30 s', 'Prolonger et modifier une vidéo'],
    // fal facture au jeton : 0,2205 / 0,473 / 1,164 $ par seconde générée en 480p / 720p / 1080p. Avec des vidéos de référence,
    // le tarif est multiplié par 0,6 et la durée des vidéos fournies s'ajoute à celle de la sortie.
    price: { per: 's', byRes: { '480p': 0.2205, '720p': 0.473, '1080p': 1.164 }, videoInput: 0.6 },
    verified: true,
    caps: {
      duration: { min: 4, max: 30, integer: true },
      resolutions: ['480p', '720p', '1080p'],
      ratios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      audio: 'toggle',
      startFrame: 'optional',
      endFrame: true,
      audioRef: true,
      elements: false,
      multiShot: false,
      cameraMotion: false,
      references: { images: 30, videos: 10, audios: 10 }, // « @Image1 », « @Video1 », « @Audio1 » dans le prompt
      tasks: ['reference', 'editing', 'extension'], // avec une vidéo de référence : la prolonger ou la modifier
    },
  },
  {
    id: 'h3-max',
    input: 'both',
    endpoint: 'minimax/h3-max/image-to-video',
    name: 'MiniMax H3 Max',
    tagline: 'Fidèle au prompt, texte seul ou image de départ',
    tags: ['Texte seul possible', 'Image de fin', 'Piste audio importable', '1080p'],
    price: { usd: 0.0325, per: 's' }, // fal : 0,0325 $/s (le catalogue disait 0,05)
    verified: true,
    caps: {
      duration: { min: 2, max: 10 }, // durée libre ; plafond non documenté : borne prudente
      resolutions: ['480p', '768p', '1080p'],
      ratio: 'image', // suit l'image ; 16:9 en texte seul
      audio: 'always', // la piste sonore est toujours générée (ou fournie via target_audio_url)
      startFrame: 'optional', // sans image : routage texte → vidéo
      endFrame: true,
      audioRef: true, // target_audio_url
      elements: false,
      multiShot: false,
    },
  },
  {
    id: 'h3-max-turbo',
    input: 'both',
    endpoint: 'minimax/h3-max-turbo/image-to-video',
    name: 'MiniMax H3 Max Turbo',
    tagline: 'La version rapide et économique pour itérer',
    tags: ['Rapide', 'Économique', 'Texte seul possible'],
    price: { usd: 0.01625, per: 's' }, // fal : 0,01625 $/s (le catalogue disait 0,025)
    verified: false, // prix lu ; capacités supposées identiques à H3 Max
    caps: {
      duration: { min: 2, max: 10 },
      resolutions: ['480p', '768p', '1080p'],
      ratio: 'image',
      audio: 'always',
      startFrame: 'optional',
      endFrame: true,
      audioRef: true,
      elements: false,
      multiShot: false,
    },
  },
  {
    id: 'ltx-2-3-pro',
    input: 'image',
    endpoint: 'fal-ai/ltx-2.3/image-to-video',
    name: 'LTX 2.3 Pro',
    tagline: 'Open source, 4K avec audio natif',
    tags: ['Open source', '4K', 'Audio natif', 'Image de fin', '48 i/s'],
    // Prix lu sur la page du modèle : 0,08 $/s en 1080p, 0,16 $/s en 1440p, 0,32 $/s en 2160p.
    // (Un tableau de la même page affiche 0,06 / 0,12 / 0,24 : on retient la valeur la plus haute.)
    price: { per: 's', byRes: { '1080p': 0.08, '1440p': 0.16, '2160p': 0.32 } },
    verified: true,
    caps: {
      duration: { values: [6, 8, 10] },
      resolutions: ['1080p', '1440p', '2160p'],
      ratios: ['auto', '16:9', '9:16'], // auto : suit l'image de départ
      fps: [24, 25, 48, 50],
      audio: 'toggle',
      startFrame: 'required',
      endFrame: true,
      audioRef: false, // l'audio en entrée passe par un autre endpoint (audio-to-video)
      elements: false,
      multiShot: false,
      cameraMotion: false,
    },
  },
  {
    id: 'ltx-2-5-fast',
    input: 'image',
    endpoint: 'lightricks/ltx-2.5/image-to-video/fast',
    name: 'LTX 2.5 Fast',
    tagline: 'Itérations rapides, jusqu’à 20 s',
    tags: ['Open source', 'Rapide', 'Jusqu’à 20 s', 'Mouvement de caméra'],
    price: { per: 's', byRes: { '720p': 0.09, '1080p': 0.13, '1440p': 0.19, '2160p': 0.3 } },
    verified: true,
    caps: {
      // 720p et 1080p : jusqu'à 20 s à 24/25 i/s, 10 s à 48/50 i/s ; 1440p et 2160p : 10 s maximum.
      duration: { values: [6, 8, 10, 12, 14, 16, 18, 20], limit: (res, fps) => (['720p', '1080p'].includes(res) && fps <= 25 ? 20 : 10) },
      resolutions: ['720p', '1080p', '1440p', '2160p'],
      ratios: ['auto', '16:9', '9:16'],
      fps: [24, 25, 48, 50],
      audio: 'toggle',
      startFrame: 'required',
      endFrame: true,
      audioRef: false,
      elements: false,
      multiShot: false,
      cameraMotion: true,
    },
  },
  {
    id: 'ltx-2-3-pro-t2v',
    input: 'text',
    endpoint: 'fal-ai/ltx-2.3/text-to-video',
    name: 'LTX 2.3 Pro · texte',
    tags: ['Open source', '4K', 'Audio natif', '48 i/s'],
    price: { per: 's', byRes: { '1080p': 0.08, '1440p': 0.16, '2160p': 0.32 } }, // même écart de prix que l'image → vidéo : voir la note ci-dessus
    verified: true,
    caps: {
      duration: { values: [6, 8, 10] },
      resolutions: ['1080p', '1440p', '2160p'],
      ratios: ['16:9', '9:16'], // pas d'image : le format est choisi
      fps: [24, 25, 48, 50],
      audio: 'toggle',
      startFrame: 'none', // texte seul
      endFrame: false,
      audioRef: false,
      elements: false,
      multiShot: false,
      cameraMotion: false,
    },
  },
  {
    id: 'ltx-2-3-fast-t2v',
    input: 'text',
    endpoint: 'fal-ai/ltx-2.3/text-to-video/fast',
    name: 'LTX 2.3 Fast · texte',
    tags: ['Open source', 'Rapide', 'Jusqu’à 20 s', 'Audio natif'],
    price: { per: 's', byRes: { '1080p': 0.06, '1440p': 0.12, '2160p': 0.24 } },
    verified: true,
    caps: {
      // Au-delà de 10 s (12 à 20 s) : uniquement à 25 i/s et en 1080p.
      duration: { values: [6, 8, 10, 12, 14, 16, 18, 20], limit: (res, fps) => (res === '1080p' && fps === 25 ? 20 : 10) },
      resolutions: ['1080p', '1440p', '2160p'],
      ratios: ['16:9', '9:16'],
      fps: [24, 25, 48, 50],
      audio: 'toggle',
      startFrame: 'none',
      endFrame: false,
      audioRef: false,
      elements: false,
      multiShot: false,
      cameraMotion: false,
    },
  },
  {
    id: 'ltx-2-3-a2v',
    input: 'audio',
    endpoint: 'fal-ai/ltx-2.3/audio-to-video',
    name: 'LTX 2.3 · Audio → vidéo',
    tags: ['Open source', 'Synchronisé sur l’audio', 'Image de départ facultative'],
    price: { usd: 0.1, per: 's' }, // par seconde de vidéo générée (= durée de l'audio)
    verified: true,
    caps: {
      duration: { fromAudio: { min: 2, max: 10 } }, // la durée est celle de l'audio ; 10 s max pour l'endpoint Pro
      resolutions: null, // pas de paramètre de résolution
      ratios: ['auto', '16:9', '9:16'], // auto : suit l'image, sinon 16:9
      audio: 'provided', // la piste est celle de l'utilisateur
      startFrame: 'optional', // sans image, le prompt devient obligatoire
      endFrame: false,
      audioRef: 'required', // audio_url
      elements: false,
      multiShot: false,
      cameraMotion: false,
    },
  },
]

/**
 * Prolonger une vidéo (Modifier → Étendre la vidéo) : entrée = un clip, sortie = la suite (ou le début).
 * Pas de résolution, de format, de fréquence ni de son : tout est hérité du clip d'origine.
 */
export const EXTEND_MODEL = {
  id: 'ltx-2-3-extend',
  endpoint: 'fal-ai/ltx-2.3/extend-video',
  name: 'LTX 2.3 · Prolonger',
  tags: ['Open source', 'Début ou fin du clip'],
  price: { usd: 0.1, per: 's' }, // par seconde de vidéo générée
  verified: true,
  caps: {
    duration: { min: 2, max: 20 },
    directions: [{ id: 'end', title: 'Suite', desc: 'Prolonge le clip après sa dernière image.' }, { id: 'start', title: 'Avant', desc: 'Ajoute une scène avant le début du clip.' }],
    context: [0, 2, 5, 10, 20], // secondes du clip utilisées comme contexte ; 0 = automatique (maximum possible)
    videoRequired: true,
  },
}

const RATIOS_IMG = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9']

export const IMAGE_MODELS = [
  {
    id: 'nano-banana-pro',
    endpoint: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    tagline: 'Réalisme, texte lisible dans l’image, jusqu’en 4K',
    badge: 'TOP',
    tags: ['Texte lisible', '4K', 'Références'],
    price: { usd: 0.15, per: 'image' },
    verified: false,
    caps: { ratios: RATIOS_IMG, resolutions: ['1K', '2K', '4K'], resUnits: { '1K': 1, '2K': 1, '4K': 2 }, maxImages: 4 },
  },
  {
    id: 'nano-banana-2',
    endpoint: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    tagline: 'Rapide et abordable pour explorer des idées',
    tags: ['Rapide', 'Économique'],
    price: { usd: 0.08, per: 'image' },
    verified: false,
    caps: { ratios: RATIOS_IMG, resolutions: ['1K', '2K'], resUnits: { '1K': 1, '2K': 1 }, maxImages: 4 },
  },
  {
    id: 'flux-3',
    endpoint: 'blackforestlabs/flux-3/text-to-image', // schéma lu : une image par appel, pas de num_images
    name: 'Flux 3',
    tagline: 'Facturé au mégapixel : très bon marché en petit format',
    tags: ['Ultra économique', 'Facturation au mégapixel'],
    price: { usd: 0.048, per: 'Mpx' }, // fal : 0,048 $/mégapixel (le catalogue disait 0,024 : on vendait au prix coûtant)
    verified: false,
    caps: { ratios: RATIOS_IMG, resolutions: ['1K', '2K'], resUnits: { '1K': 1, '2K': 4 }, maxImages: 1 },
  },
]

export const AUDIO_MODELS = [
  {
    id: 'eleven-v3',
    endpoint: 'fal-ai/elevenlabs/tts/eleven-v3',
    name: 'ElevenLabs v3',
    tagline: 'Le plus expressif, pour les voix de personnage et les récits',
    badge: 'TOP',
    tags: ['Expressif', 'Multilingue', 'Mot à mot'],
    price: { usd: 0.1, per: '1 000 caractères' },
    verified: true,
    // Paramètres réellement exposés : voice, stability (0–1), language_code, apply_text_normalization, timestamps.
    // Pas de vitesse, de hauteur ni de volume.
    caps: { params: ['stability', 'language', 'normalization', 'timestamps'] },
  },
  {
    id: 'eleven-multilingual-v2',
    endpoint: 'fal-ai/elevenlabs/tts/multilingual-v2',
    name: 'ElevenLabs Multilingual v2',
    tagline: 'Stable et naturel dans de nombreuses langues',
    tags: ['Multilingue', 'Stable'],
    price: { usd: 0.1, per: '1 000 caractères' },
    verified: false,
    caps: { params: ['stability', 'language', 'normalization', 'timestamps'] },
  },
  {
    id: 'eleven-turbo-v2-5',
    endpoint: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    name: 'ElevenLabs Turbo v2.5',
    tagline: 'Faible latence, deux fois moins cher',
    tags: ['Rapide', 'Économique'],
    price: { usd: 0.05, per: '1 000 caractères' },
    verified: false,
    caps: { params: ['stability', 'language', 'normalization', 'timestamps'] },
  },
]

export const findModel = (list, id) => list.find((m) => m.id === id) ?? list[0]

const DURATION_PICKS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]

/** Durées proposées : une liste fixe (éventuellement limitée selon résolution et fréquence) ou une plage. */
export const durationOptions = (caps, res, fps) => {
  const d = caps.duration
  if (d.fromAudio) return [] // durée imposée par le fichier audio
  if (d.values) return d.values.filter((v) => v <= (d.limit ? d.limit(res, fps) : Infinity))
  return DURATION_PICKS.filter((v) => v >= d.min && v <= d.max)
}

/** Prix par seconde en USD : fixe, ou selon la résolution. */
export const usdPerSecond = (model, res) => model.price.byRes ? (model.price.byRes[res] ?? Math.min(...Object.values(model.price.byRes))) : model.price.usd
/**
 * Coût d'une vidéo en jetons. Pour un modèle qui accepte des vidéos de référence (`price.videoInput`), fal facture aussi leur durée,
 * à un tarif multiplié par `videoInput` : `inputSecs` est la durée totale des vidéos fournies.
 */
export const videoCost = (model, seconds, res, { inputSecs = 0 } = {}) => {
  const rate = usdPerSecond(model, res)
  const usd = inputSecs > 0 && model.price.videoInput ? rate * model.price.videoInput * (seconds + inputSecs) : rate * seconds
  return toJetons(usd)
}

// Mouvements de caméra (camera_motion) : « auto » n'envoie rien.
export const CAMERA_MOTIONS = [
  { id: 'none', title: 'Caméra : auto' }, { id: 'dolly_in', title: 'Travelling avant' }, { id: 'dolly_out', title: 'Travelling arrière' },
  { id: 'dolly_left', title: 'Travelling à gauche' }, { id: 'dolly_right', title: 'Travelling à droite' },
  { id: 'jib_up', title: 'Grue vers le haut' }, { id: 'jib_down', title: 'Grue vers le bas' },
  { id: 'static', title: 'Plan fixe' }, { id: 'focus_shift', title: 'Changement de point' },
]
export const imageCost = (model, res, count) => Math.round(toJetons(model.price.usd * (model.caps.resUnits[res] ?? 1)) * count * 10) / 10
/** Essayage virtuel : une photo de personne et une photo de vêtement donnent la personne habillée (fal-ai/fashn/tryon/v1.6, 0,075 $ la génération). */
export const TRYON_MODEL = { id: 'fashn-tryon-v1-6', endpoint: 'fal-ai/fashn/tryon/v1.6', name: 'FASHN Essayage', price: { usd: 0.075, per: 'image' }, verified: true }
export const tryonCost = () => toJetons(TRYON_MODEL.price.usd)
export const voiceCost = (model, chars) => toJetons(model.price.usd * Math.max(1, Math.ceil(chars / 1000)))

/** Prix affiché dans le sélecteur : « ≈ 2,5 jetons / s », « ≈ 5,4 jetons / image »… */
export const priceLabel = (model) => {
  const unit = { s: 's', image: 'image', Mpx: 'Mpx', '1 000 caractères': '1 000 car.' }[model.price.per]
  const from = model.price.byRes ? Math.min(...Object.values(model.price.byRes)) : model.price.usd
  const n = toJetons(from)
  return `${model.price.byRes ? 'dès ' : ''}≈ ${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} cauri${n >= 2 ? 's' : ''} / ${unit}`
}
