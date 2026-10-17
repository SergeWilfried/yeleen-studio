import { useState } from 'react'

const saveData = () => typeof navigator !== 'undefined' && navigator.connection?.saveData === true
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Tuile média légère : l'affichage par défaut est une affiche statique
 * (dégradé ou `url(...)`). La vidéo n'est jamais préchargée : elle n'est montée
 * qu'au survol, au focus clavier ou au toucher, puis démontée à la sortie.
 * `focus` : point d'intérêt du cadrage (object-position CSS) quand la source n'a pas le ratio de la tuile.
 */
export default function MediaTile({ as: Tag = 'div', poster, video, focus = 'center', className, style, children, ...rest }) {
  const [active, setActive] = useState(false)
  const canPlay = Boolean(video) && !saveData() && !reducedMotion()
  const on = () => canPlay && setActive(true)
  const off = () => setActive(false)

  return (
    <Tag
      {...rest}
      className={className}
      style={{ ...style, background: poster }}
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      onTouchStart={on}
    >
      {active && <video className="mv" style={{ objectPosition: focus }} src={video} autoPlay muted loop playsInline preload="none" aria-hidden="true" />}
      {children}
    </Tag>
  )
}
