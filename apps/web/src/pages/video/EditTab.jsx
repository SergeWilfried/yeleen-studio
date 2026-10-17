import { useState } from 'react'
import ThumbCarousel from '../../components/ThumbCarousel.jsx'
import { gradient } from '../../lib/gradients.js'
import portrait from '../../assets/hero/influenceur.jpg'
import setPoster from '../../assets/hero/montage.jpg'
import setVideo from '../../assets/hero/montage.mp4'

const g = (i) => gradient(i, 'video')
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const AMBIANCES = [
  { label: 'Jour', filter: 'none' },
  { label: 'Crépuscule', filter: 'sepia(.55) hue-rotate(-20deg) saturate(1.6) brightness(.8)' },
  { label: 'Heure dorée', filter: 'sepia(.8) saturate(1.8) brightness(1.05)' },
  { label: 'Néon', filter: 'sepia(1) hue-rotate(250deg) saturate(3) contrast(1.1) brightness(.85)' },
  { label: 'Nuit', filter: 'sepia(1) hue-rotate(185deg) saturate(1.8) brightness(.5) contrast(1.2)' },
  { label: 'Froid', filter: 'sepia(1) hue-rotate(165deg) saturate(1.1) brightness(.95)' },
  { label: 'Noir et blanc', filter: 'grayscale(1) contrast(1.2)' },
]
const RATIOS = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['21:9', 21 / 9]]

/**
 * mode : `variants` (ambiances), `ratio` (formats), `split` (avant/après), `video` (extrait animé).
 */
export const EDIT_TOOLS = [
  { id: 'edit', icon: 'wand', name: 'Modifier la vidéo', sub: 'Appliquez des changements ciblés', title: 'Éclairage et ambiance', desc: 'Passez du jour au crépuscule ou ajoutez un éclairage cinématographique. Le modèle comprend la géométrie 3D pour ajuster lumières et ombres.', mode: 'variants' },
  { id: 'extend', icon: 'extend', name: 'Étendre la vidéo', sub: 'Générez une suite', title: 'Prolongez la scène', desc: "Ajoutez jusqu'à 30 secondes en gardant le même style, les mêmes personnages et le même mouvement de caméra.", mode: 'video', chip: '+ 30 s' },
  { id: 'reframe', icon: 'crop', name: 'Recadrer', sub: 'Redimensionnez pour tous les formats', title: 'Un format pour chaque écran', desc: 'Passez du 16:9 au 9:16 ou au carré : le sujet reste centré dans le cadre.', mode: 'ratio' },
  { id: 'upscale', icon: 'upscale', name: 'Agrandir', sub: 'Augmentez la résolution', title: 'Une image plus nette', desc: "Montez jusqu'en 4K et récupérez le détail des textures et des visages.", mode: 'split', before: { label: '480p', filter: 'blur(2.5px) contrast(.9)' }, after: { label: '4K', filter: 'none' } },
  { id: 'bg', icon: 'cutout', name: "Supprimer l'arrière-plan", sub: "Détourez l'objet", isNew: true, title: 'Détourage automatique', desc: 'Isolez un sujet en mouvement sur fond transparent, sans masque manuel.', mode: 'split', before: { label: 'Original', filter: 'none' }, after: { label: 'Masque', filter: 'grayscale(1) contrast(8) brightness(.9)' } },
  { id: 'hdr', icon: 'hdr', name: 'SDR vers HDR', sub: 'Convertissez vos rushes SDR', isNew: true, title: 'Plus de contraste, plus de couleurs', desc: 'Convertissez vos séquences standard en HDR avec des hautes lumières préservées.', mode: 'split', before: { label: 'SDR', filter: 'saturate(.6) contrast(.8) brightness(1.05)' }, after: { label: 'HDR', filter: 'saturate(1.3) contrast(1.15)' } },
  { id: 'fps', icon: 'gauge', name: 'Boost FPS', sub: 'Augmentez la fréquence d’images', isNew: true, title: 'Des mouvements plus fluides', desc: 'Passez de 24 à 60 images par seconde, sans effet de flou.', mode: 'video', chip: '24 → 60 i/s' },
  { id: 'depth', icon: 'layers', name: 'Carte de profondeur', sub: 'Cartes de profondeur à partir du média', isNew: true, title: 'Profondeur de champ', desc: 'Générez une carte de profondeur image par image, prête pour la 3D et la composition.', mode: 'split', before: { label: 'Original', filter: 'none' }, after: { label: 'Profondeur', filter: 'grayscale(1) contrast(1.3) invert(1)' } },
]

/** Avant / après : un curseur natif (accessible) pilote la position de la coupe. */
function Compare({ before, after }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="evf cmp" style={{ '--ar': 16 / 9, '--pos': `${pos}%` }}>
      <img src={portrait} alt="" style={{ filter: before.filter }} />
      <img className="aft" src={portrait} alt="" style={{ filter: after.filter }} />
      <span className="cl l">{before.label}</span>
      <span className="cl r">{after.label}</span>
      <span className="ch" aria-hidden="true" />
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label={`Comparer ${before.label} et ${after.label}`} />
    </div>
  )
}

function Stage({ t, ex }) {
  if (t.mode === 'split') return <Compare before={t.before} after={t.after} />
  if (t.mode === 'video') {
    return (
      <div className="evf" style={{ '--ar': 16 / 9 }}>
        <video src={setVideo} poster={setPoster} autoPlay={!reducedMotion()} muted loop playsInline preload="metadata" aria-label={t.title} />
        <span className="cl r">{t.chip}</span>
      </div>
    )
  }
  const ratio = t.mode === 'ratio' ? RATIOS[ex] : null
  return (
    <div key={ratio?.[0]} className="evf" style={{ '--ar': ratio ? ratio[1] : 16 / 9 }}>
      <img src={portrait} alt="" style={{ filter: t.mode === 'variants' ? AMBIANCES[ex].filter : 'none' }} />
      <span className="cl r">{ratio ? ratio[0] : AMBIANCES[ex].label}</span>
    </div>
  )
}

export function EditRight({ tool }) {
  const t = EDIT_TOOLS.find((x) => x.id === tool) ?? EDIT_TOOLS[0]
  const [ex, setEx] = useState(0)
  const items = t.mode === 'variants'
    ? AMBIANCES.map((a, i) => ({ id: i, label: a.label, poster: `url(${portrait}) center/cover`, filter: a.filter }))
    : t.mode === 'ratio'
      ? RATIOS.map(([label], i) => ({ id: i, label, poster: `url(${portrait}) center/cover` }))
      : null
  return (
    <div className="ev">
      <div className="evs"><Stage t={t} ex={ex} /></div>
      <div className="evt">
        <h1>{t.title}</h1>
        <p>{t.desc}</p>
      </div>
      {items && <ThumbCarousel items={items} value={ex} onChange={setEx} size={36} showLabel label={`${t.mode === 'ratio' ? 'Formats' : 'Ambiances'} : ${t.title}`} />}
    </div>
  )
}
