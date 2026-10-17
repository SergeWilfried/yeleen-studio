import { toJetons } from './models.js'

/**
 * Workflows fal exécutés tels quels (clonés dans le compte fal du studio). Le serveur n'accepte que ceux de cette liste :
 * l'application n'envoie jamais un identifiant de workflow libre. Les champs d'entrée viennent des pages de modèles de fal ;
 * le prix est l'estimation affichée par fal pour un lancement (le coût réel dépend des étapes exécutées).
 * type : `text` (texte), `image` (une photo), `images` (liste de photos, même champ côté fal).
 */
export const WORKFLOWS = [
  {
    id: 'weather',
    name: 'Weather',
    endpoint: 'workflows/labsprogiciel-coder/weather',
    usd: 1.27,
    blurb: 'La photo d’un lieu devient une vidéo sous la météo de votre choix',
    inputs: [
      { key: 'image_urls', type: 'images', min: 1, max: 1, label: 'Photo du lieu' },
      { key: 'weather', type: 'text', required: true, label: 'Météo', placeholder: 'Ex. : forte pluie et orage', example: 'forte pluie et orage au loin' },
    ],
  },
  {
    id: 'photo-to-video',
    name: 'Photo to Video',
    endpoint: 'workflows/labsprogiciel-coder/photo-to-video',
    usd: 1.28,
    blurb: 'Les photos de deux personnes deviennent une vidéo où elles se serrent dans les bras',
    inputs: [
      { key: 'person1', type: 'image', label: 'Première personne' },
      { key: 'person2', type: 'image', label: 'Deuxième personne' },
    ],
  },
  {
    id: 'fan-cam',
    name: 'Ma fan-cam',
    endpoint: 'workflows/labsprogiciel-coder/fan-cam',
    usd: 1.39,
    blurb: 'Une vidéo de fan-cam à partir de vos photos',
    inputs: [
      { key: 'image_urls', type: 'images', min: 1, max: 3, label: 'Vos photos' },
      { key: 'details', type: 'text', required: false, label: 'Détails', placeholder: 'Ex. : concert en plein air, ambiance de foule', example: 'concert en plein air, ambiance de foule' },
    ],
  },
  {
    id: 'kling-multi-shot-creator',
    name: 'Scène en 4 plans',
    endpoint: 'workflows/labsprogiciel-coder/kling-multi-shot-creator',
    usd: 1.44,
    blurb: 'Une vidéo de 15 s en 4 plans, cohérente, à partir d’une idée',
    inputs: [
      { key: 'prompt', type: 'text', required: true, label: 'Votre idée', placeholder: 'Ex. : une exploratrice traverse un marché de nuit', example: 'une exploratrice traverse un marché de nuit sous la pluie' },
    ],
  },
  {
    id: 'documentary',
    name: 'Documentaire',
    endpoint: 'workflows/labsprogiciel-coder/documentary',
    usd: 20, // mesuré par le propriétaire du compte fal ; l'estimation affichée par fal est de 14,94 $
    blurb: 'Un texte devient un petit documentaire, avec images et vidéo (42 étapes)',
    inputs: [
      { key: 'scene', type: 'text', required: true, label: 'Votre sujet', placeholder: 'Ex. : la vie d’un marché de pêcheurs à l’aube', example: 'la vie d’un marché de pêcheurs à l’aube' },
    ],
  },
]
export const findWorkflow = (id) => WORKFLOWS.find((w) => w.id === id)
export const workflowCost = (w) => toJetons(w.usd)
export const TEXT_MAX = 1000

/** Ce qui ne va pas dans les entrées d'un workflow (ou null). `isFile` dit si une valeur de fichier est acceptée. */
export function workflowInputIssue(w, inputs = {}, isFile = (v) => typeof v === 'string' && v.length > 0) {
  for (const f of w.inputs) {
    const v = inputs[f.key]
    if (f.type === 'text') {
      if (v != null && (typeof v !== 'string' || v.length > TEXT_MAX)) return `invalid_${f.key}`
      if (f.required && !v?.trim()) return `missing_${f.key}`
    } else if (f.type === 'image') {
      if (!isFile(v)) return `missing_${f.key}`
    } else if (!Array.isArray(v) || v.length < f.min || v.length > f.max || !v.every(isFile)) return `missing_${f.key}`
  }
  return null
}
