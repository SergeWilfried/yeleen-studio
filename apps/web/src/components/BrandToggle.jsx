import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { useBrand } from '../lib/brand.jsx'

/**
 * Applique (ou non) le style visuel de la marque à la prochaine génération.
 * `className` s'adapte à la barre qui l'accueille ; `iconOnly` : pastille sans texte (le nom reste dit aux lecteurs d'écran).
 */
export default function BrandToggle({ className = 'ep-chip', iconOnly = false }) {
  const { brand, patch, style } = useBrand()
  return (
    <button type="button" className={className} aria-pressed={brand.apply} aria-label={iconOnly ? 'Style de la marque' : undefined} title={brand.apply ? (style ? `Style de la marque activé : ${style}` : 'Style de la marque activé (aucun style défini dans Marque)') : 'Style de la marque désactivé'} onClick={() => patch({ apply: !brand.apply })}>
      <Icon name="palette" size={15} />{!iconOnly && 'Style de la marque'}
    </button>
  )
}
