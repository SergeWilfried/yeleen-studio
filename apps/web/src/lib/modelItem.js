import { toJetons } from '@studio/catalog'
import { logoFor } from './modelLogos.js'

const KIND_ICON = { video: 'film', image: 'img', audio: 'sound' }
const INPUT_LABEL = { image: 'Image → vidéo', text: 'Texte → vidéo', both: 'Texte ou image', audio: 'Audio → vidéo' }
const UNIT = { s: 's', image: 'image', Mpx: 'Mpx', '1 000 caractères': '1 000 car.' }

/**
 * Entrée de sélecteur de modèle : icône, nom, badge, puces de capacités (résolution max, durée, entrée) et prix.
 * Les puces viennent des capacités du modèle : rien n'est affiché pour ce qu'il ne gère pas.
 */
export function modelItem(model, kind) {
  const c = model.caps ?? {}
  const specs = []
  if (kind === 'video') {
    const res = c.resolutions?.at(-1)
    if (res) specs.push({ icon: 'upscale', text: res })
    const d = c.duration
    const span = d?.fromAudio ?? (d?.values?.length ? { min: Math.min(...d.values), max: Math.max(...d.values) } : d)
    if (span?.min != null) specs.push({ icon: 'clock', text: `${span.min}s-${span.max}s` })
    if (INPUT_LABEL[model.input]) specs.push({ icon: 'img', text: INPUT_LABEL[model.input] })
  } else if (kind === 'image') {
    const res = c.resolutions?.at(-1)
    if (res) specs.push({ icon: 'upscale', text: res })
    if (c.maxImages) specs.push({ icon: 'layers', text: c.maxImages > 1 ? `1 à ${c.maxImages} images` : '1 image' })
  } else {
    for (const t of (model.tags ?? []).slice(0, 2)) specs.push({ text: t })
  }
  const from = model.price.byRes ? Math.min(...Object.values(model.price.byRes)) : model.price.usd
  return {
    id: model.id,
    icon: KIND_ICON[kind],
    logo: logoFor(model.id), // remplace l'icône générique quand la marque est connue
    title: model.name,
    badge: model.badge,
    specs,
    price: { from: Boolean(model.price.byRes), n: toJetons(from), unit: UNIT[model.price.per] },
  }
}
