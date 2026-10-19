import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PACKS } from '@studio/catalog/packs'
import { gradient as g } from '../lib/gradients.js'
import Icon, { Heart, PlayBadge } from '../lib/icons.jsx'
import { HomeHeader, SkipLink } from '../components/Headers.jsx'
import MediaTile from '../components/MediaTile.jsx'
import LazyMount from '../components/LazyMount.jsx'
import montageVideo from '../assets/hero/montage.mp4'
import montagePoster from '../assets/hero/montage.jpg'
import pubsVideo from '../assets/hero/pubs.mp4'
import pubsPoster from '../assets/hero/pubs.jpg'
import imagePoster from '../assets/hero/image.jpg'
import influenceurPoster from '../assets/hero/influenceur.jpg'
import '../styles/home.css'

const HANDLES = ['@lumen.ko', '@atelier.noor', '@sahel.frames', '@pixel.nomad', '@bamako.reel', '@kora.vision', '@dune.studio', '@mira.cuts', '@nuit.claire', '@zan.motion', '@ciel.rouge', '@oasis.lab']
const LIKES = ['12,4 k', '8,1 k', '23 k', '5,6 k', '9,9 k', '17 k', '3,2 k', '41 k', '6,7 k', '11 k', '2,8 k', '15 k']

const FEATURED = [
  ['Studio montage', 'Vos clips, en un clic'],
  ['Studio pubs', 'Recréez une pub avec vos produits'],
  ['Modèle image 2.1', '14 références, un visuel 4K'],
  ['Influenceur IA', 'Un personnage constant'],
]
const HERO_MEDIA = [
  { poster: montagePoster, video: montageVideo, focus: '38% center' },
  { poster: pubsPoster, video: pubsVideo, focus: '40% center' },
  { poster: imagePoster, focus: 'center 20%' },
  { poster: influenceurPoster, focus: '50% center' },
]
const TOOLS = [
  { name: 'Modèle vidéo 2.5', badge: 'TOP', sub: 'Le modèle vidéo le plus avancé', icon: 'bars', pill: 'Vidéo' },
  { name: 'Influenceur IA', badge: 'NEW', sub: 'Créez votre prochaine machine à buzz', icon: 'sparkle' },
  { name: 'Multiversion', badge: 'NEW', sub: 'Une vidéo, plusieurs versions', icon: 'logo' },
  { name: 'MCP pour assistants', sub: 'Générez images et vidéos dans votre assistant', icon: 'burst', color: '#f0824a' },
  { name: 'Studio cinéma 4.0', sub: 'Créez des scènes cinématographiques sans effort', icon: 'film' },
  { name: 'Superordinateur', sub: 'Un agent créatif propulsé par un modèle de pointe', icon: 'app' },
]
const TEMPLATES = ['Look catalogue', 'Course de rue', 'Portrait néon', 'Mode éditorial', 'Vol de drone', 'Clip rétro', 'Produit flottant', 'Scène de pluie']
const POSTERS = Array.from({ length: 8 }, (_, i) => `[TITRE ${i + 1}]`)
const FILTERS = ['Tout', 'Vidéo', 'Image', 'Audio', 'Publicité', 'Personnages', 'Mode', 'Produit']
/**
 * URLs vidéo courtes (6 à 8 s, muettes, ~480p, mp4/webm < 1 Mo), par tuile.
 * Tant qu'une clé est absente, la tuile reste une affiche statique.
 * Clés : `feat-0`, `tpl-3`, `gal-7`…
 */
const VIDEO_SRC = {}
const ROWS_STEP = 2
// Coût moyen d'une génération, aligné sur les écrans d'outils (image 6,5 · vidéo 60).
const COST = { image: 6.5, video: 60 }
const fcfa = (n) => n.toLocaleString('fr-FR')
const usage = (jetons) => {
  const images = `≈ ${fcfa(Math.floor(jetons / COST.image))} images`
  const videos = Math.floor(jetons / COST.video)
  return videos ? `${images} ou ${fcfa(videos)} vidéo${videos > 1 ? 's' : ''}` : images
}
const GALLERY = [[400, 260, 300], [280, 380, 300], [360, 300, 300], [300, 420, 240], [420, 260, 280]]

function Creator({ i }) {
  return (
    <div className="cr">
      <s style={{ background: g(i + 3) }} />
      <span>{HANDLES[i % 12]}</span>
      <em><Heart />{LIKES[i % 12]}</em>
    </div>
  )
}

// Packs de jetons (packages/catalog) : paiement ponctuel par Mobile Money, sans abonnement. Le prix affiché est celui que l'API encaisse.
const PACK_INFO = {
  decouverte: { name: 'Découverte', sub: 'Pour essayer les outils' },
  createur: { name: 'Créateur', sub: 'Pour vos contenus de la semaine' },
  studio: { name: 'Studio', sub: 'Pour créer tous les jours', tag: 'Meilleur prix' },
}
const PERKS = ['Tous les modèles du studio', 'Cauris sans date d’expiration', 'Remboursés si une génération échoue']

function Pack({ pack }) {
  const info = PACK_INFO[pack.id] ?? { name: pack.id, sub: '' }
  const featured = Boolean(info.tag)
  return (
    <article className={`plan${featured ? ' feat' : ''}`}>
      {info.tag && <span className="pop">{info.tag}</span>}
      <h3>{info.name}</h3>
      <p className="ps2">{info.sub}</p>
      <div className="pp">
        <b>{fcfa(pack.fcfa)}</b>
        <span>FCFA, une fois</span>
      </div>
      <small className="pn">≈ {Math.round(pack.fcfa / pack.jetons)} FCFA le cauri</small>
      <div className="jt">
        <b>{fcfa(pack.jetons)} cauris</b>
        <small>{usage(pack.jetons)}</small>
      </div>
      <Link to={`/recharge?pack=${pack.id}`} className={featured ? 'lim' : 'pbtn'}>Acheter ce pack</Link>
      <ul>{PERKS.map((x) => <li key={x}>{x}</li>)}</ul>
    </article>
  )
}

export default function Home() {
  useDocumentTitle(null)
  const [filter, setFilter] = useState('Tout')
  const [rows, setRows] = useState(ROWS_STEP)

  return (
    <div className="pg home">
      <SkipLink />
      <HomeHeader />

      <main className="wrap" id="main" tabIndex={-1}>
        <h1 className="sr-only">Studio Yeelen : créez des vidéos, des images et de l’audio avec l’IA</h1>
        <div className="hero">
          {FEATURED.map(([t, s], i) => (
            <MediaTile key={t} as="a" href="#" className="ft4" poster={`url(${HERO_MEDIA[i].poster}) ${HERO_MEDIA[i].focus}/cover`} focus={HERO_MEDIA[i].focus} video={HERO_MEDIA[i].video ?? VIDEO_SRC[`feat-${i}`]}>
              <PlayBadge />
              <div><b>{t}</b><span>{s}</span></div>
            </MediaTile>
          ))}
        </div>

        <div className="bento">
          <div className="pr">
            <h2>Créez votre compte<span>et payez à l’usage</span></h2>
            <ul>
              <li>Compte gratuit, sans abonnement</li>
              <li>Cauris par Mobile Money, dès {fcfa(PACKS[0].fcfa)} FCFA</li>
              <li>Remboursés si une génération échoue</li>
            </ul>
            <div><Link className="lim" to="/cinema">Créer un compte</Link></div>
          </div>
          <div className="tg6">
            {TOOLS.map((t) => (
              <a key={t.name} href="#" className="tc2">
                <div className="ti">
                  <Icon name={t.icon} size={22} color={t.color ?? '#fff'} />
                  {t.pill && <span className="tpl"><Icon name="vid" size={14} />{t.pill}</span>}
                </div>
                <div>
                  <b>{t.name}{t.badge && <i className={`tgb${t.badge === 'TOP' ? ' top' : ''}`}>{t.badge}</i>}</b>
                  <p>{t.sub}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="sec"><h3>Templates populaires</h3><a href="#">Tout voir</a></div>
        <LazyMount minHeight={340}>
          <div className="rail">
            {TEMPLATES.map((t, i) => (
              <MediaTile key={t} className="tp" poster={g(i + 5)} video={VIDEO_SRC[`tpl-${i}`]}>
                <PlayBadge />
                <a href="#" className="us">Utiliser</a>
                <div className="tb"><b>{t}</b><span>{((i * 37) % 90) + 10} k utilisations</span></div>
              </MediaTile>
            ))}
          </div>
        </LazyMount>

        <section className="inf">
          <div className="pt" style={{ left: 0, background: 'radial-gradient(circle at 55% 32%,#c9b48a 0 11%,transparent 12%),radial-gradient(ellipse at 40% 108%,#1c1c1e 0 50%,transparent 51%)' }} />
          <div className="pt" style={{ right: 0, background: 'radial-gradient(circle at 45% 32%,#b0623a 0 11%,transparent 12%),radial-gradient(ellipse at 60% 108%,#1c1c1e 0 50%,transparent 51%)' }} />
          <h2>Votre prochaine machine à buzz</h2>
          <p>Choisissez le look. Ajoutez du mouvement.</p>
          <a href="#" className="lim" style={{ position: 'relative' }}>Créer mon influenceur IA</a>
        </section>

        <section className="fest">
          <div className="fh">
            <h2>Festival : les votes sont ouverts</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#d6ff3f', fontWeight: 600 }}>Prix du public · [MONTANT]</span>
              <div className="cd">3J : 09H : 46M</div>
            </div>
          </div>
          <div className="pg4">
            {POSTERS.map((t, i) => (
              <div key={t} className="po" style={{ background: g(i + 8) }}><s className="rb" /><b>{t}</b></div>
            ))}
          </div>
        </section>

        <section className="mcp">
          <span className="chip" style={{ left: '12%', top: '38%' }}>Réalisateur</span>
          <span className="bl" style={{ left: '14%', top: '52%' }} />
          <span className="chip" style={{ right: '14%', top: '16%' }}>Motion designer</span>
          <span className="bl" style={{ right: '16%', top: '30%' }} />
          <span className="bl" style={{ right: '20%', bottom: '12%' }} />
          <h2>Utilisez [MARQUE] dans votre assistant IA</h2>
          <p>Planifiez un projet créatif étape par étape.</p>
        </section>

        <section className="pricing" id="tarifs" aria-labelledby="pricing-title">
          <div className="ph">
            <div>
              <h2 id="pricing-title">Rechargez, créez</h2>
              <p>Chaque génération consomme des cauris. Pas d’abonnement : achetez un pack par Mobile Money quand vous en avez besoin.</p>
            </div>
          </div>
          <div className="plans">
            {PACKS.map((p) => <Pack key={p.id} pack={p} />)}
          </div>
          <p className="pfoot">Prix en FCFA, taxes locales non incluses. Paiement par Orange Money ou Moov Money. Le coût de chaque génération est affiché avant de la lancer.</p>
        </section>

        <div className="sec" style={{ marginBottom: 0 }}><h3>Créations de la communauté</h3></div>
        <div className="fl">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`fp${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <LazyMount minHeight={700}>
          <div className="gal">
            {GALLERY.map((col, ci) => (
              <div key={ci} className="gc">
                {col.slice(0, rows).map((h, ri) => {
                  const i = ci * 3 + ri
                  return (
                    <MediaTile key={i} className="gt" style={{ height: h }} poster={g(i)} video={VIDEO_SRC[`gal-${i}`]}>
                      {i % 2 === 0 && <PlayBadge />}
                      {i === 2 && <div className="ov"><a href="#" className="rc">Recréer</a></div>}
                      <Creator i={i} />
                    </MediaTile>
                  )
                })}
              </div>
            ))}
          </div>
          {rows < 3 && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button type="button" className="more" onClick={() => setRows((r) => r + 1)}>Charger plus</button>
            </div>
          )}
        </LazyMount>
      </main>

      <footer className="ft"><span>© [MARQUE]</span><span>Conditions · Confidentialité · Contact</span></footer>
    </div>
  )
}
