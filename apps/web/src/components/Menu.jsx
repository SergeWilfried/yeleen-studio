import { Fragment, useEffect, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import ModelLogo from './ModelLogo.jsx'
import '../styles/menu.css'

/**
 * Liste déroulante accessible (listbox). Le menu est en `position: fixed` pour ne pas
 * être rogné par un panneau défilant. Clavier : flèches, Début/Fin, Entrée, Échap.
 *
 * <Menu items={[{ id, title, desc, icon, badge }]} value={id} onChange={setId} label="Outil" heading="Modes">
 *   contenu du bouton
 * </Menu>
 */
export default function Menu({ items, value, onChange, label, heading, menuWidth = 280, className = '', listClass = '', search = null, children }) {
  const [pos, setPos] = useState(null)
  const [q, setQ] = useState('')
  const btn = useRef(null)
  const list = useRef(null)
  const open = pos !== null

  const close = (refocus = false) => {
    setPos(null)
    setQ('')
    if (refocus) btn.current?.focus()
  }

  const toggle = () => {
    if (open) return close()
    const r = btn.current.getBoundingClientRect()
    const width = Math.max(menuWidth, r.width)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    const above = r.top
    // Ouvre vers le haut quand le bas manque de place (ex. barre de prompt collée en bas de l'écran).
    setPos(below < 300 && above > below
      ? { bottom: window.innerHeight - r.top + 6, left, width, maxHeight: Math.max(160, above - 18) }
      : { top: r.bottom + 6, left, width, maxHeight: Math.max(160, below - 18) })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) close() }
    const onAway = (e) => { if (!(e.target instanceof Node) || !list.current?.contains(e.target)) close() }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onAway)
    window.addEventListener('scroll', onAway, true)
    if (search) list.current?.querySelector('.mn-search input')?.focus()
    else list.current?.querySelector('[aria-selected="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onAway)
      window.removeEventListener('scroll', onAway, true)
    }
  }, [open])

  const onKey = (e) => {
    const opts = [...list.current.querySelectorAll('[role="option"]')]
    if (!opts.length && e.key !== 'Escape' && e.key !== 'Tab') return
    const i = opts.indexOf(document.activeElement)
    const go = (n) => { e.preventDefault(); opts[(n + opts.length) % opts.length].focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home' && e.target.tagName !== 'INPUT') go(0)
    else if (e.key === 'End' && e.target.tagName !== 'INPUT') go(opts.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close()
  }

  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((it) => `${it.title} ${it.badge ?? ''} ${(it.specs ?? []).map((x) => x.text).join(' ')} ${(it.tags ?? []).join(' ')}`.toLowerCase().includes(needle)) : items

  return (
    <>
      <button ref={btn} type="button" className={`mn-btn${open ? ' open' : ''} ${className}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={toggle}>
        {children}
        <Icon name="chevD" size={16} />
      </button>
      {open && (
        <div ref={list} className={`mn-list ${listClass}`} role="listbox" aria-label={label} style={pos} onKeyDown={onKey}>
          {heading && <div className="mn-head">{heading}</div>}
          {search && (
            <label className="mn-search">
              <Icon name="search" size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={search} aria-label={search} autoComplete="off" spellCheck={false} />
            </label>
          )}
          {shown.map((it, i) => (
            <Fragment key={it.id}>
            {it.group && it.group !== shown[i - 1]?.group && <div className="mn-group"><Icon name="sparkle" size={14} />{it.group}</div>}
            <button type="button" role="option" aria-selected={it.id === value} className={`mn-opt${it.id === value ? ' on' : ''}${it.specs ? ' model' : ''}`} onClick={() => { onChange(it.id); close(true) }}>
              {it.logo ? <span className="mn-ic logo"><ModelLogo logo={it.logo} size={22} /></span> : it.icon && <span className="mn-ic"><Icon name={it.icon} size={it.specs ? 20 : 18} /></span>}
              <span className="mn-tx">
                <b>{it.title}{it.badge && <em>{it.badge}</em>}</b>
                {it.desc && <small>{it.desc}</small>}
                {it.tags && <span className="mn-tags">{it.tags.map((t) => <i key={t}>{t}</i>)}</span>}
                {it.specs?.length > 0 && <span className="mn-tags">{it.specs.map((sp) => <i key={sp.text}>{sp.icon && <Icon name={sp.icon} size={12} />}{sp.text}</i>)}</span>}
              </span>
              {it.price && (
                <span className="mn-price">
                  <b><Icon name="sparkle" size={13} />{it.price.from ? 'dès ' : ''}{it.price.n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</b>
                  {it.price.unit && <small>/ {it.price.unit}</small>}
                </span>
              )}
              {it.aside && <span className="mn-aside">{it.aside}</span>}
            </button>
            </Fragment>
          ))}
          {search && shown.length === 0 && <p className="mn-none" role="status">Aucun résultat pour « {q.trim()} »</p>}
        </div>
      )}
    </>
  )
}
