import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
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
const ANNUAL_DISCOUNT = 0.3
// Coût moyen d'une génération, aligné sur les écrans d'outils (image 6,5 · vidéo 60).
const COST = { image: 6.5, video: 60 }
const PRO_TIERS = [{ jetons: 600, monthly: 20000 }, { jetons: 900, monthly: 30000 }]
const fcfa = (n) => n.toLocaleString('fr-FR')
const annualPrice = (monthly) => Math.round((monthly * (1 - ANNUAL_DISCOUNT)) / 100) * 100
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

function Plan({ name, sub, monthly, annual, jetons, fixed, quote, unit, cta, to, featured, tag, picker, perks }) {
  const price = annual ? annualPrice(monthly) : monthly
  const note = quote ? 'Tarif par personne et par mois, selon la taille de l’équipe'
    : !monthly ? '\u00a0'
      : annual ? `Facturé ${fcfa(price * 12)} FCFA par an` : '\u00a0'
  return (
    <article className={`plan${featured ? ' feat' : ''}`}>
      {tag && <span className={`pop${featured ? '' : ' alt'}`}>{tag}</span>}
      <h3>{name}</h3>
      <p className="ps2">{sub}</p>
      <div className="pp">
        {quote ? <b className="qt">Sur devis</b> : <b>{fcfa(price)}</b>}
        {!quote && <span>{unit ?? 'FCFA / mois'}</span>}
        {!quote && annual && monthly > 0 && <s aria-label={`au lieu de ${fcfa(monthly)}`}>{fcfa(monthly)}</s>}
      </div>
      <small className="pn">{note}</small>
      <div className="jt">
        <b>{quote ? 'Dès ' : ''}{fcfa(jetons)} jetons<span> / {quote ? 'personne / ' : ''}mois</span></b>
        <small>{usage(jetons)}{quote ? ' par personne' : ''}</small>
        {picker ?? <small className="fx">{fixed ? 'Quantité fixe, sans variation' : quote ? 'Jetons mutualisés dans l’équipe' : '\u00a0'}</small>}
      </div>
      {to ? <Link to={to} className={featured ? 'lim' : 'pbtn'}>{cta}</Link> : <a href="#" className={featured ? 'lim' : 'pbtn'}>{cta}</a>}
      <ul>{perks.map((x) => <li key={x}>{x}</li>)}</ul>
    </article>
  )
}

export default function Home() {
  useDocumentTitle(null)
  const [filter, setFilter] = useState('Tout')
  const [rows, setRows] = useState(ROWS_STEP)
  const [promo, setPromo] = useState(true)
  const [annual, setAnnual] = useState(false)
  const [tier, setTier] = useState(0)

  return (
    <div className="pg home">
      <SkipLink />
      {promo && (
        <div className="promo">
          <span>Remise supplémentaire sur les formules premium après inscription</span>
          <a href="#">Obtenir ma remise</a>
          <button type="button" className="x" aria-label="Fermer le bandeau" onClick={() => setPromo(false)}>✕</button>
        </div>
      )}
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
            <h2>Inscrivez-vous et obtenez votre<span>remise exclusive</span></h2>
            <ul>
              <li>Accès illimité au modèle image Pro</li>
              <li>Débloquez votre remise supplémentaire</li>
              <li>Accès au modèle vidéo 2.5</li>
            </ul>
            <div><a className="lim" href="#">Créer un compte et obtenir ma remise</a></div>
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
              <h2 id="pricing-title">Choisissez votre formule</h2>
              <p>Chaque génération consomme des jetons. Sans engagement : changez de formule ou arrêtez à tout moment.</p>
            </div>
            <div className="bill" role="group" aria-label="Facturation">
              <button type="button" aria-pressed={!annual} className={annual ? '' : 'on'} onClick={() => setAnnual(false)}>Mensuel</button>
              <button type="button" aria-pressed={annual} className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>Annuel<i>-30 %</i></button>
            </div>
          </div>
          <div className="plans">
            <Plan name="Gratuit" sub="Pour découvrir les outils" monthly={0} unit="FCFA, pour toujours" jetons={50} cta="Commencer gratuitement" to="/cinema" annual={annual}
              perks={['Modèle image standard', 'Vidéo en 720p, filigrane', '1 génération à la fois']} />
            <Plan name="Basic" sub="Pour vos premiers contenus" monthly={7000} jetons={120} fixed cta="Choisir Basic" to="/recharge?pack=createur" annual={annual}
              perks={['Modèle vidéo 2.5 en 720p', 'Sans filigrane', '2 générations en parallèle', 'Influenceur IA : 10 essais offerts']} />
            <Plan name="Pro" sub="Pour créer tous les jours" monthly={PRO_TIERS[tier].monthly} jetons={PRO_TIERS[tier].jetons} cta="Choisir Pro" to="/recharge?pack=studio" featured tag="Le plus choisi" annual={annual}
              picker={(
                <div className="tier" role="radiogroup" aria-label="Jetons par mois">
                  {PRO_TIERS.map((t, i) => (
                    <button key={t.jetons} type="button" role="radio" aria-checked={tier === i} className={tier === i ? 'on' : ''} onClick={() => setTier(i)}>{fcfa(t.jetons)}</button>
                  ))}
                </div>
              )}
              perks={['Modèle vidéo 2.5 jusqu’en 1080p', 'Studio montage et Studio pubs', '3 générations en parallèle', 'Accès anticipé aux nouveaux modèles']} />
            <Plan name="Max" sub="Pour les équipes et les agences" quote jetons={1000} cta="Demander un devis" tag="Par personne" annual={annual}
              perks={['Espace de travail et jetons mutualisés', 'Vidéo en 4K, file prioritaire', 'Contrôle des dépenses par l’administrateur', 'Support prioritaire']} />
          </div>
          <p className="pfoot">Prix en FCFA, taxes locales non incluses. Les jetons non utilisés ne sont pas reportés d’un mois sur l’autre.</p>
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
