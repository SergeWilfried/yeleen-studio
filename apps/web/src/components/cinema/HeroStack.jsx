import { useEffect, useState } from 'react'
import montagePoster from '../../assets/hero/montage.jpg'
import montageVideo from '../../assets/hero/montage.mp4'
import pubsPoster from '../../assets/hero/pubs.jpg'
import pubsVideo from '../../assets/hero/pubs.mp4'
import portrait from '../../assets/hero/influenceur.jpg'
import scene from '../../assets/hero/image.jpg'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Exemples de rendus : trois cartes à la fois, la carte centrale en lecture.
const CARDS = [
  { id: 'montage', poster: montagePoster, video: montageVideo, label: 'Montage de plateau' },
  { id: 'portrait', poster: portrait, label: 'Portrait' },
  { id: 'pubs', poster: pubsPoster, video: pubsVideo, label: 'Spot produit' },
  { id: 'scene', poster: scene, label: 'Scène de rue' },
]

/** Pile de trois cartes qui tournent doucement : la carte du centre est lue, les voisines dépassent derrière. */
export default function HeroStack() {
  const [i, setI] = useState(0)
  const n = CARDS.length
  useEffect(() => {
    if (reduced()) return
    const id = setInterval(() => setI((x) => (x + 1) % n), 4500)
    return () => clearInterval(id)
  }, [n])

  return (
    <div className="hs" role="group" aria-label="Exemples de rendus">
      {CARDS.map((c, k) => {
        const rel = ((k - i + n + Math.floor(n / 2)) % n) - Math.floor(n / 2) // -2…1 : position par rapport à la carte centrale
        const side = rel === 0 ? 'c' : rel === -1 ? 'l' : rel === 1 ? 'r' : 'x'
        return (
          <figure key={c.id} className={`hs-card ${side}`} aria-hidden={side !== 'c'}>
            <img src={c.poster} alt="" loading="eager" />
            {c.video && side === 'c' && !reduced() && <video src={c.video} poster={c.poster} muted loop autoPlay playsInline preload="metadata" aria-hidden="true" />}
            {side === 'c' && <figcaption>{c.label}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
