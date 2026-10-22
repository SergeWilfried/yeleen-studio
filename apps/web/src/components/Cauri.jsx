import cauri from '../assets/brand/cauri.webp'
import { jetons } from '../lib/jobs.jsx'

/** Le cauri : l'unité de crédit du studio. Décoratif : le nombre qui l'accompagne porte le sens (voir `Amount`). */
export default function Cauri({ size, className }) {
  const style = size ? { height: size, width: Math.round(size * 1.04) } : undefined
  return <img className={`cauri${className ? ` ${className}` : ''}`} src={cauri} alt="" width="75" height="72" style={style} aria-hidden="true" />
}

/**
 * Un montant : le cauri devant, puis le nombre. Avec `word`, le mot reste écrit (« 46 cauris ») : à réserver aux endroits où
 * le montant se lit seul (cartes, packs, phrases). Sans lui, le cauri suffit dans les puces serrées, et un lecteur d'écran
 * lit quand même « 46 cauris ».
 */
export function Amount({ n, size, word = false }) {
  const unit = `cauri${n >= 2 ? 's' : ''}`
  return (
    <span className="amt">
      <Cauri size={size} />
      <span>{jetons(n)}{word ? ` ${unit}` : <span className="sr-only"> {unit}</span>}</span>
    </span>
  )
}
