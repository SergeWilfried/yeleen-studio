import { useEffect, useRef } from 'react'
import Icon from '../lib/icons.jsx'
import '../styles/thumb-carousel.css'

/**
 * Sélecteur à vignettes : flèches rondes de chaque côté, pastille centrale avec
 * des vignettes circulaires, l'élément actif est agrandi en pilule cerclée de blanc.
 *
 * <ThumbCarousel items={[{ id, poster, label }]} value={id} onChange={setId} />
 *
 * - `poster` : valeur CSS `background` (dégradé ou `url(...) center/cover`).
 * - `size`   : diamètre d'une vignette en px (tout le composant s'adapte).
 * - `loop`   : les flèches bouclent au lieu de s'arrêter aux extrémités.
 * - `showLabel` : affiche le libellé de l'élément actif sous le sélecteur.
 * - `filter` (par élément) : filtre CSS appliqué à la vignette.
 * Clavier : flèches gauche et droite quand le groupe a le focus.
 */
export default function ThumbCarousel({ items, value, onChange, size = 56, loop = false, label = 'Exemples', showLabel = false }) {
  const track = useRef(null)
  const idx = Math.max(0, items.findIndex((it) => it.id === value))

  const go = (n) => {
    const len = items.length
    const next = loop ? (n + len) % len : Math.min(len - 1, Math.max(0, n))
    if (items[next].id !== value) onChange(items[next].id)
  }

  // Centre l'élément actif dans la pastille et garde le focus clavier dessus.
  useEffect(() => {
    const box = track.current
    const el = box?.querySelector('[aria-checked="true"]')
    if (!box || !el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' })
    if (box.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [value])

  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(idx - 1) }
  }

  return (
    <div className="tcw">
    <div className="tc" style={{ '--d': `${size}px` }} role="group" aria-label={label}>
      <button type="button" className="tc-btn" onClick={() => go(idx - 1)} disabled={!loop && idx === 0} aria-label="Précédent">
        <Icon name="chevL" size={Math.round(size * 0.45)} />
      </button>
      <div className="tc-pill">
        <div className="tc-track" ref={track} role="radiogroup" aria-label={label} onKeyDown={onKey}>
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="radio"
              aria-checked={i === idx}
              aria-label={it.label}
              tabIndex={i === idx ? 0 : -1}
              className={`tc-it${i === idx ? ' on' : ''}`}
              onClick={() => onChange(it.id)}
            >
              <i style={{ background: it.poster, filter: it.filter }} />
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="tc-btn" onClick={() => go(idx + 1)} disabled={!loop && idx === items.length - 1} aria-label="Suivant">
        <Icon name="chevR" size={Math.round(size * 0.45)} />
      </button>
    </div>
    {showLabel && <span className="tc-cap" aria-live="polite">{items[idx].label}</span>}
    </div>
  )
}
