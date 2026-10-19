import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import icon from '../../assets/brand/yeelen-icon.svg'
import { AccountMenu } from '../../lib/auth.jsx'
import { features } from '../../lib/features.js'
import { jetons, useJobs } from '../../lib/jobs.jsx'
import { useLibrary } from '../../lib/libraryDialog.jsx'

const PROMO = 'studio.cinema.promo.v1'
const dismissed = () => { try { return localStorage.getItem(PROMO) === 'off' } catch { return false } }

const MODES = [
  { id: 'image', icon: 'img', label: 'Image', tint: 'blue' },
  { id: 'video', icon: 'vid', label: 'Vidéo', tint: 'red' },
  { id: 'recipe', icon: 'layers', label: 'Modèles', tint: 'lime' },
]
// Chaque entrée ouvre la fenêtre de la bibliothèque sur la bonne vue.
const NAV = [
  { view: { tab: 'library', sub: 'all', origin: 'generated' }, icon: 'sparkle', label: 'Mes générations', tint: 'cyan' },
  { view: { tab: 'library', sub: 'all', origin: 'upload' }, icon: 'at', label: 'Mes éléments', tint: 'blue' },
  { view: { tab: 'favs' }, icon: 'star', label: 'Mes favoris', tint: 'pink' },
]

/** Barre latérale de l'espace de travail : intitulé, type de création (Image, Vidéo, Modèles), accès aux fichiers, carte d'invitation, tarifs et compte. */
export default function Sidebar({ collapsed, onToggle, mode, onMode }) {
  const { balance } = useJobs()
  const { openLibrary } = useLibrary()
  const [promo, setPromo] = useState(() => !dismissed())
  const close = () => { setPromo(false); try { localStorage.setItem(PROMO, 'off') } catch { /* ignoré */ } }

  return (
    <aside className={`cs${collapsed ? ' min' : ''}`} aria-label="Espace de travail">
      <div className="cs-top">
        <div className="cs-ws">
          <img className="cs-logo" src={icon} alt="" width="30" height="30" />
          {!collapsed && <h2 className="cs-name">Studio cinéma</h2>}
        </div>
        <button type="button" className="cs-toggle" onClick={onToggle} aria-pressed={collapsed} aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}>
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <div role="radiogroup" aria-label="Type de création">
        <ul className="cs-nav cs-modes">
          {MODES.map((m) => (
            <li key={m.id}>
              <button type="button" role="radio" aria-checked={mode === m.id} title={collapsed ? m.label : undefined} onClick={() => onMode(m.id)}>
                <span className={`cs-ic ${m.tint}`}><Icon name={m.icon} size={16} /></span>
                {!collapsed && m.label}
                {collapsed && <span className="sr-only">{m.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <nav aria-label="Mes fichiers" className="cs-files">
        <ul className="cs-nav">
          {NAV.map((n) => (
            <li key={n.label}>
              <button type="button" aria-haspopup="dialog" title={collapsed ? n.label : undefined} onClick={() => openLibrary(n.view)}>
                <span className={`cs-ic ${n.tint}`}><Icon name={n.icon} size={16} /></span>
                {!collapsed && n.label}
                {collapsed && <span className="sr-only">{n.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="cs-grow" />

      {promo && features.spot && !collapsed && (
        <section className="cs-promo" aria-label="Suggestion">
          <button type="button" className="cs-x" onClick={close} aria-label="Fermer la suggestion"><Icon name="close" size={12} /></button>
          <small>Passer de l’idée à la pub</small>
          <b>Un spot avec voix et sous-titres en trois étapes</b>
          <Link className="cs-thumb" to="/spot" aria-hidden="true" tabIndex={-1} />
          <Link className="cs-cta" to="/spot">Créer un spot</Link>
        </section>
      )}

      <button type="button" className="cs-row" aria-haspopup="dialog" title={collapsed ? 'Bibliothèque' : undefined} onClick={() => openLibrary()}>
        <span className="cs-ic gray"><Icon name="folder" size={16} /></span>
        {!collapsed && <><span>Bibliothèque</span><Icon name="chevR" size={16} /></>}
        {collapsed && <span className="sr-only">Bibliothèque</span>}
      </button>

      <div className="cs-foot">
        <Link className="cs-price" to="/recharge" title={collapsed ? 'Recharger' : undefined}>
          <span className="cs-ic red"><Icon name="diamond" size={16} /></span>
          {!collapsed && <span>Recharger</span>}
          {collapsed && <span className="sr-only">Recharger mes cauris</span>}
        </Link>
        <div className="cs-user">
          <AccountMenu fallback={<span className="av" aria-hidden="true" />} />
          {!collapsed && <span className="cs-who">Mon compte<small>{jetons(balance)} cauris</small></span>}
          {collapsed && <span className="sr-only">Mon compte, {jetons(balance)} cauris</span>}
        </div>
      </div>
    </aside>
  )
}
