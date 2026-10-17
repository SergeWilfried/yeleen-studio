import { useState } from 'react'
import '../styles/chrome.css'
import useCountdown from '../lib/useCountdown.js'

/** Bandeau promo des écrans d'outils : minuteur + message + bouton, fermable. */
export default function PromoBar({ seconds, badge = 'Offre limitée', children, cta, badgeClass = 'tm', showTimer = true }) {
  const { label } = useCountdown(seconds)
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="promo">
      <span className={badgeClass}>{badge}</span>
      {showTimer && <span className="tt">{label}</span>}
      <span>{children}</span>
      <a href="#" className="pcta">{cta}</a>
      <button type="button" className="px" aria-label="Fermer le bandeau" onClick={() => setOpen(false)}>✕</button>
    </div>
  )
}
