import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import BalanceChip from './BalanceChip.jsx'
import { AccountMenu, authEnabled, useAuthState } from '../lib/auth.jsx'
import { features } from '../lib/features.js'
import { useLibrary } from '../lib/libraryDialog.jsx'
import logo from '../assets/brand/yeelen-logo-on-lime.svg'
import mark from '../assets/brand/yeelen-mark-on-lime.svg'
import '../styles/chrome.css'

const ROUTES = { Explorer: '/', Image: '/image', Vidéo: '/video', Audio: '/audio', 'Spot pub': '/spot', Marque: '/brand', Cinéma: '/cinema' } // Bibliothèque : une fenêtre, pas une page

// Seules les pages qui existent figurent dans la navigation.
const FLAG_OF = { Image: 'image', Vidéo: 'video', Audio: 'audio', 'Spot pub': 'spot', Marque: 'brand' } // écrans éteints par drapeau : absents de la navigation
export const NAV = ['Explorer', 'Image', 'Vidéo', 'Cinéma', 'Audio', 'Spot pub', 'Marque', 'Bibliothèque'].filter((l) => !FLAG_OF[l] || features[FLAG_OF[l]])

export function Logo() {
  return (
    <NavLink to="/" className="lg" aria-label="Studio Yeelen, accueil">
      <picture>
        <source media="(max-width: 560px)" srcSet={mark} />
        <img src={logo} alt="" height="22" />
      </picture>
    </NavLink>
  )
}

function NavLinks() {
  const nav = useRef(null)
  const { pathname } = useLocation()
  const { openLibrary } = useLibrary()
  // Sur écran étroit la barre défile : on amène le lien de la page courante dans la zone visible.
  useEffect(() => {
    const el = nav.current?.querySelector('.nl.on')
    if (nav.current && el) nav.current.scrollTo({ left: el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2 })
  }, [pathname])
  return (
    <nav className="nls" ref={nav} aria-label="Navigation principale">
      {NAV.map((label) => (label === 'Bibliothèque'
        ? <button key={label} type="button" className="nl" aria-haspopup="dialog" onClick={() => openLibrary()}>{label}</button>
        : (
          <NavLink key={label} to={ROUTES[label]} end={label === 'Explorer'} className={({ isActive }) => `nl${isActive ? ' on' : ''}`}>
            {label}
          </NavLink>
        )))}
    </nav>
  )
}

/** En-tête compact des écrans d'outils (vidéo, image, audio). */
export function ShellHeader() {
  return (
    <header className="nv">
      <Logo />
      <NavLinks />
      <div className="rt">
        <BalanceChip />
        <Icon name="search" />
        <NavLink to="/recharge" className="pb">Recharger</NavLink>
        <a href="#" className="pb">Entreprise</a>
        <a href="#" className="pb">Ressources</a>
        <AccountMenu fallback={<span className="av" />} />
      </div>
    </header>
  )
}

/** Connexion et création de compte (Clerk), ou le menu du compte une fois connecté. Sans Clerk (développement), les emplacements d'origine. */
function HomeAccount() {
  const { signedIn } = useAuthState()
  if (!authEnabled) return (<><a href="#" className="pb">Connexion</a><a href="#" className="lim">Créer un compte</a></>)
  if (signedIn) return <AccountMenu />
  return (<><NavLink to="/sign-in" className="pb">Connexion</NavLink><NavLink to="/sign-up" className="lim">Créer un compte</NavLink></>)
}

/** En-tête de la page d'accueil. */
export function HomeHeader() {
  return (
    <header className="nv">
      <Logo />
      <NavLinks />
      <div className="rt">
        <a href="#tarifs" className="pb">Tarifs<i className="of">-30 %</i></a>
        <HomeAccount />
      </div>
    </header>
  )
}

/** Lien d'évitement : premier élément focalisable, mène au contenu principal (`id="main"`). */
export function SkipLink() {
  return <a className="skip" href="#main">Aller au contenu</a>
}
