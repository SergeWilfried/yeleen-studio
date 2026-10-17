import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import Menu from '../Menu.jsx'
import { jetons, useJobs } from '../../lib/jobs.jsx'

const PROMO = 'studio.cinema.promo.v1'
const dismissed = () => { try { return localStorage.getItem(PROMO) === 'off' } catch { return false } }

// Les autres espaces de l'application : le sélecteur en haut de la barre y mène.
const STUDIOS = [
  { id: '/cinema', icon: 'film', title: 'Studio cinéma' },
  { id: '/image', icon: 'img', title: 'Image' },
  { id: '/video', icon: 'vid', title: 'Vidéo' },
  { id: '/audio', icon: 'mus', title: 'Audio' },
  { id: '/spot', icon: 'burst', title: 'Spot pub' },
  { id: '/brand', icon: 'palette', title: 'Marque' },
  { id: '/library', icon: 'folder', title: 'Bibliothèque' },
]
const NAV = [
  { to: '/', icon: 'app', label: 'Accueil', tint: 'gray' },
  { to: '/library?source=generated', icon: 'sparkle', label: 'Mes générations', tint: 'cyan' },
  { to: '/library?source=upload', icon: 'at', label: 'Mes éléments', tint: 'blue' },
  { to: '/library?filter=starred', icon: 'star', label: 'Mes favoris', tint: 'pink' },
]

/** Barre latérale de l'espace de travail : changement d'espace, accès aux fichiers, carte d'invitation, tarifs et compte. */
export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const { balance } = useJobs()
  const [promo, setPromo] = useState(() => !dismissed())
  const close = () => { setPromo(false); try { localStorage.setItem(PROMO, 'off') } catch { /* ignoré */ } }

  return (
    <aside className={`cs${collapsed ? ' min' : ''}`} aria-label="Espace de travail">
      <div className="cs-top">
        <Menu items={STUDIOS} value="/cinema" onChange={navigate} label="Changer d’espace" menuWidth={240} className="cs-ws">
          <span className="cs-logo"><Icon name="logo" size={18} color="#111" /></span>
          {!collapsed && <span className="cs-name">Studio cinéma</span>}
        </Menu>
        <button type="button" className="cs-toggle" onClick={onToggle} aria-pressed={collapsed} aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}>
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <nav aria-label="Mes fichiers">
        <ul className="cs-nav">
          {NAV.map((n) => (
            <li key={n.label}>
              <Link to={n.to} title={collapsed ? n.label : undefined}>
                <span className={`cs-ic ${n.tint}`}><Icon name={n.icon} size={16} /></span>
                {!collapsed && n.label}
                {collapsed && <span className="sr-only">{n.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="cs-grow" />

      {promo && !collapsed && (
        <section className="cs-promo" aria-label="Suggestion">
          <button type="button" className="cs-x" onClick={close} aria-label="Fermer la suggestion"><Icon name="close" size={12} /></button>
          <small>Passer de l’idée à la pub</small>
          <b>Un spot avec voix et sous-titres en trois étapes</b>
          <Link className="cs-thumb" to="/spot" aria-hidden="true" tabIndex={-1} />
          <Link className="cs-cta" to="/spot">Créer un spot</Link>
        </section>
      )}

      <Link className="cs-row" to="/library" title={collapsed ? 'Bibliothèque' : undefined}>
        <span className="cs-ic gray"><Icon name="folder" size={16} /></span>
        {!collapsed && <><span>Bibliothèque</span><Icon name="chevR" size={16} /></>}
        {collapsed && <span className="sr-only">Bibliothèque</span>}
      </Link>

      <div className="cs-foot">
        <Link className="cs-price" to="/#tarifs" title={collapsed ? 'Tarifs' : undefined}>
          <span className="cs-ic red"><Icon name="diamond" size={16} /></span>
          {!collapsed && <><span>Tarifs</span><i>-30 %</i></>}
          {collapsed && <span className="sr-only">Tarifs</span>}
        </Link>
        <div className="cs-user">
          <span className="av" aria-hidden="true" />
          {!collapsed && <span className="cs-who">Mon compte<small>{jetons(balance)} jetons</small></span>}
          {collapsed && <span className="sr-only">Mon compte, {jetons(balance)} jetons</span>}
        </div>
      </div>
    </aside>
  )
}
