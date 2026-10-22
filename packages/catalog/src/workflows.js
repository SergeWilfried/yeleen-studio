import { toJetons } from './models.js'

/**
 * Workflows fal exécutés tels quels (clonés dans le compte fal du studio). Le serveur n'accepte que ceux de cette liste :
 * l'application n'envoie jamais un identifiant de workflow libre. Les champs d'entrée viennent des pages de modèles de fal ;
 * le prix est l'estimation affichée par fal pour un lancement (le coût réel dépend des étapes exécutées).
 * type : `text` (texte), `image` (une photo), `images` (liste de photos, même champ côté fal),
 * `lines` (une valeur par ligne, de `min` à `max` lignes, répartie par `expand` sur plusieurs champs côté fal).
 */
export const WORKFLOWS = [
  {
    id: 'weather',
    name: 'Météo à la carte',
    endpoint: 'workflows/labsprogiciel-coder/weather',
    usd: 1.27,
    blurb: 'Votre lieu sous la pluie, la neige ou un ciel d’orage : une vidéo à partir d’une seule photo',
    inputs: [
      { key: 'image_urls', type: 'images', min: 1, max: 1, label: 'Photo du lieu' },
      { key: 'weather', type: 'text', required: true, label: 'Météo', placeholder: 'Ex. : forte pluie et orage', example: 'forte pluie et orage au loin' },
    ],
  },
  {
    id: 'photo-to-video',
    name: 'Retrouvailles',
    endpoint: 'workflows/labsprogiciel-coder/photo-to-video',
    usd: 1.28,
    blurb: 'Deux photos, une étreinte : la vidéo de deux proches qui se retrouvent',
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
    blurb: 'Vous, filmé depuis la foule comme une star : une fan-cam à partir de vos photos',
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
  {
    id: 'city-journey',
    name: 'Voyage de ville en ville',
    endpoint: 'workflows/labsprogiciel-coder/city-journey',
    usd: 2.5, // PROVISOIRE : estimation à remplacer par le prix affiché par fal une fois le workflow cloné (≈ 7 images et 7 vidéos)
    blurb: 'Votre photo, puis vous dans 7 villes : une seule vidéo verticale qui enchaîne le voyage',
    inputs: [
      { key: 'image_urls', type: 'images', min: 1, max: 1, label: 'Votre photo' },
      {
        key: 'cities', type: 'lines', required: true, min: 3, max: 7, label: 'Vos villes', placeholder: 'Une ville par ligne (3 à 7)', example: 'Dakar\nAbidjan\nParis\nMarrakech\nDubaï\nTokyo\nNew York',
        // Le workflow attend 7 villes (prompt, prompt_2 … prompt_7) : avec moins, le voyage reprend au départ.
        expand: (lines) => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i ? `prompt_${i + 1}` : 'prompt', lines[i % lines.length]])),
      },
    ],
  },
  {
    id: 'fal-vton',
    name: 'Essayage en vidéo',
    endpoint: 'workflows/labsprogiciel-coder/fal-vton',
    usd: 1, // PROVISOIRE : à remplacer par le prix affiché par fal une fois le workflow cloné
    blurb: 'Un vêtement et une personne : la vidéo de l’essayage, pour présenter vos tenues',
    inputs: [
      { key: 'model_image', type: 'image', label: 'Photo de la personne' },
      { key: 'garment_image', type: 'image', label: 'Photo du vêtement' },
    ],
  },
  {
    id: 'replace-anything',
    name: 'Changer un objet',
    endpoint: 'workflows/labsprogiciel-coder/replace-anything',
    usd: 0.15, // PROVISOIRE : à remplacer par le prix affiché par fal une fois le workflow cloné
    blurb: 'Remplacez un objet de votre photo par un autre, le reste de l’image ne bouge pas',
    inputs: [
      { key: 'image_url', type: 'image', label: 'Votre photo' },
      { key: 'text_prompt', type: 'text', required: true, label: 'Quoi remplacer', placeholder: 'Ex. : le sac sur la table', example: 'le sac sur la table' },
      { key: 'prompt', type: 'text', required: true, label: 'Par quoi', placeholder: 'Ex. : un sac en cuir rouge', example: 'un sac en cuir rouge' },
    ],
  },
  {
    id: 'logo_maker',
    name: 'Mon logo',
    endpoint: 'workflows/labsprogiciel-coder/logo_maker',
    usd: 0.1, // PROVISOIRE : à remplacer par le prix affiché par fal une fois le workflow cloné
    blurb: 'Décrivez votre marque, son style et ses couleurs : un logo prêt à essayer',
    inputs: [
      { key: 'prompt', type: 'text', required: true, label: 'Votre logo', placeholder: 'Ex. : logo d’un maquis, un poisson stylisé, orange et noir', example: 'logo d’un maquis à Abidjan, un poisson stylisé, orange et noir' },
    ],
  },
]
export const findWorkflow = (id) => WORKFLOWS.find((w) => w.id === id)
export const workflowCost = (w) => toJetons(w.usd)
export const TEXT_MAX = 1000
export const splitLines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

/** Ce qui ne va pas dans les entrées d'un workflow (ou null). `isFile` dit si une valeur de fichier est acceptée. */
export function workflowInputIssue(w, inputs = {}, isFile = (v) => typeof v === 'string' && v.length > 0) {
  for (const f of w.inputs) {
    const v = inputs[f.key]
    if (f.type === 'text' || f.type === 'lines') {
      if (v != null && (typeof v !== 'string' || v.length > TEXT_MAX)) return `invalid_${f.key}`
      if (f.required && !v?.trim()) return `missing_${f.key}`
      if (f.type === 'lines' && v?.trim()) {
        const n = splitLines(v).length
        if (n < f.min || n > f.max) return `invalid_${f.key}`
      }
    } else if (f.type === 'image') {
      if (!isFile(v)) return `missing_${f.key}`
    } else if (!Array.isArray(v) || v.length < f.min || v.length > f.max || !v.every(isFile)) return `missing_${f.key}`
  }
  return null
}
