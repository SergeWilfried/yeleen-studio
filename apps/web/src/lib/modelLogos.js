import nanobanana from '../assets/logos/nanobanana-color.svg'
import flux from '../assets/logos/flux.svg'
import elevenlabs from '../assets/logos/elevenlabs.svg'
import kling from '../assets/logos/kling-color.svg'
import minimax from '../assets/logos/minimax-color.svg'
import lightricks from '../assets/logos/lightricks.svg'
import bytedance from '../assets/logos/bytedance-color.svg'

/**
 * Logo de la marque d'un modèle, d'après son identifiant. `color: true` : le logo a ses propres couleurs ;
 * sinon il est monochrome et prend la couleur du texte (voir `.ml.mono`).
 */
const BY_PREFIX = [
  ['nano-banana', { src: nanobanana, color: true, brand: 'Nano Banana' }],
  ['flux', { src: flux, color: false, brand: 'Flux' }],
  ['eleven', { src: elevenlabs, color: false, brand: 'ElevenLabs' }],
  ['kling', { src: kling, color: true, brand: 'Kling' }],
  ['h3-', { src: minimax, color: true, brand: 'MiniMax' }],
  ['ltx', { src: lightricks, color: false, brand: 'Lightricks' }],
  ['seedance', { src: bytedance, color: true, brand: 'ByteDance' }], // pas de logo « Seedance » dans la collection : celui de ByteDance, son éditeur
]
export const logoFor = (modelId) => BY_PREFIX.find(([p]) => modelId?.startsWith(p))?.[1] ?? null
