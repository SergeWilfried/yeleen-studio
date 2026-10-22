import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PACKS } from '@studio/catalog/packs'
import { RECIPES, recipeCost } from '@studio/catalog/recipes'
import { HomeHeader, SkipLink } from '../components/Headers.jsx'
import { useAuthState } from '../lib/auth.jsx'
import { RechargeButton } from '../lib/rechargeDialog.jsx'
import { jetons } from '../lib/jobs.jsx'
import { PREVIEW } from '../lib/templatePreviews.js'
import '../styles/home.css'

// Crédit offert à l'inscription : à régler sur WELCOME_JETONS côté API (0 par défaut). Tant qu'il est à 0, la page n'en parle pas.
const WELCOME = Number(import.meta.env?.VITE_WELCOME_CAURIS) || 0

const fcfa = (n) => n.toLocaleString('fr-FR')
const cauris = (n) => `${jetons(n)} cauri${n >= 2 ? 's' : ''}`

// Les quatre modèles de la première image : un par geste (une photo, deux photos, une idée, un vêtement).
const HERO_IDS = ['wf-photo-to-video', 'wf-weather', 'wf-kling-multi-shot-creator', 'wf-fal-vton']

// Les modèles qui donnent une vidéo (tous sauf le logo et la retouche d'objet).
const VIDEOS = RECIPES.filter((r) => !['wf-logo_maker', 'wf-replace-anything'].includes(r.id))
const ref = { video: recipeCost('wf-photo-to-video'), logo: recipeCost('wf-logo_maker') }
/** Ce que vaut un pack, en lancements de vrais modèles (pas en moyennes) : le plus petit ne couvre pas une vidéo. */
const usage = (n) => {
  const videos = Math.floor(n / ref.video)
  const logos = Math.floor(n / ref.logo)
  return videos ? `≈ ${fcfa(videos)} vidéo${videos > 1 ? 's' : ''} ou ${fcfa(logos)} logos` : `≈ ${fcfa(logos)} logos ou retouches, pas assez pour une vidéo`
}
/** Le plus petit pack qui paie ce modèle d'un coup. */
const packFor = (cost) => PACKS.find((p) => p.jetons >= cost)

// Les quatre buts d'un créateur : chacun regroupe les modèles qui y mènent (un modèle peut servir plusieurs buts).
const GOALS = [
  { id: 'pub', title: 'Une pub pour mon commerce', short: 'Pub', poster: 'wf-kling-multi-shot-creator', ids: ['wf-kling-multi-shot-creator', 'wf-replace-anything', 'wf-documentary'] },
  { id: 'mode', title: 'Présenter mes tenues', short: 'Mode', poster: 'wf-fal-vton', ids: ['wf-fal-vton', 'wf-replace-anything'] },
  { id: 'clip', title: 'Un clip qui fait réagir', short: 'Clip', poster: 'wf-photo-to-video', ids: ['wf-photo-to-video', 'wf-fan-cam', 'wf-weather', 'wf-city-journey'] },
  { id: 'logo', title: 'Un logo pour ma marque', short: 'Logo', poster: 'wf-logo_maker', ids: ['wf-logo_maker'] },
]
const cheapest = (ids) => Math.min(...ids.map((id) => recipeCost(id)))

// Questions fréquentes : chaque réponse repose sur ce que fait l'application (prix, remboursement, paiement), sans promesse en plus.
const FAQ = [
  ['Comment est-ce que je paie ?', `Par Mobile Money, avec Orange Money ou Moov Money. Trois packs, de ${fcfa(PACKS[0].fcfa)} à ${fcfa(PACKS.at(-1).fcfa)} FCFA, payés une fois : pas d’abonnement.`],
  ['Qu’est-ce qu’un cauri ?', 'C’est le crédit du studio. Chaque génération en consomme un certain nombre, et vos cauris n’expirent pas.'],
  ['Combien coûte une création ?', `Le prix est affiché avant de lancer, jamais après. Un logo coûte ${cauris(ref.logo)}, une vidéo à partir de ${cauris(Math.min(...VIDEOS.map((r) => recipeCost(r.id))))}.`],
  ['Et si la génération échoue ?', 'Les cauris vous sont rendus. Vous ne payez que ce qui a abouti.'],
  ['Combien de temps faut-il attendre ?', 'Une vidéo peut prendre plusieurs minutes, et un modèle long davantage. L’avancement s’affiche pendant l’attente.'],
  ['Ai-je besoin d’un compte ?', 'Oui, un compte gratuit, sans abonnement. Il suffit pour parcourir le studio ; vous rechargez des cauris au moment de lancer un modèle.'],
]

// Packs de cauris : paiement ponctuel par Mobile Money, sans abonnement. Le prix affiché est celui que l'API encaisse.
const PACK_INFO = {
  decouverte: { name: 'Découverte', sub: 'Pour essayer un logo ou une retouche' },
  createur: { name: 'Créateur', sub: 'Pour vos vidéos de la semaine' },
  studio: { name: 'Studio', sub: 'Pour créer tous les jours', tag: 'Meilleur prix' },
}
const PERKS = ['Tous les modèles du studio', 'Cauris sans date d’expiration', 'Remboursés si une génération échoue']

function Pack({ pack }) {
  const info = PACK_INFO[pack.id] ?? { name: pack.id, sub: '' }
  const featured = Boolean(info.tag)
  const { signedIn } = useAuthState()
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
      {/* Connecté : la fenêtre de recharge s'ouvre ici. Sinon, connexion d'abord, puis la fenêtre s'ouvre sur le studio. */}
      {signedIn
        ? <RechargeButton pack={pack.id} className={featured ? 'lim' : 'pbtn'}>Acheter ce pack</RechargeButton>
        : <Link to={`/recharge?pack=${pack.id}`} className={featured ? 'lim' : 'pbtn'}>Acheter ce pack</Link>}
      <ul>{PERKS.map((x) => <li key={x}>{x}</li>)}</ul>
    </article>
  )
}

/** Un modèle : son image, ce qu'il donne, son prix et le pack qui le couvre. */
function Model({ recipe, to }) {
  const cost = recipeCost(recipe.id)
  const pack = packFor(cost)
  return (
    <li>
      <Link to={to} className="md">
        <span className="mi"><img src={PREVIEW[recipe.id].poster} alt="" width="320" height="320" loading="lazy" /></span>
        <b>{recipe.name}</b>
        <span className="mb">{recipe.blurb}</span>
        <span className="mp"><b>{cauris(cost)}</b><small>{pack ? `dès ${fcfa(pack.fcfa)} FCFA` : 'plusieurs recharges'}</small></span>
      </Link>
    </li>
  )
}

export default function Home() {
  useDocumentTitle(null)
  const { signedIn } = useAuthState()
  const [goal, setGoal] = useState('all')
  const start = signedIn ? '/cinema' : '/sign-up'
  const startLabel = signedIn ? 'Ouvrir le studio' : 'Créer mon compte'
  const hero = HERO_IDS.map((id) => RECIPES.find((r) => r.id === id))
  const shown = goal === 'all' ? RECIPES : RECIPES.filter((r) => GOALS.find((g) => g.id === goal).ids.includes(r.id))
  const pick = (id) => { setGoal(id); document.getElementById('modeles')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }

  return (
    <div className="pg home">
      <SkipLink />
      <HomeHeader />

      <main id="main" tabIndex={-1}>
        <section className="lh" aria-labelledby="lh-title">
          <div className="wrap lhi">
            <div className="lc">
              <h1 id="lh-title">Votre vidéo par l’IA, payée par Mobile Money</h1>
              <p>Choisissez un modèle, ajoutez une photo ou une idée. Le prix s’affiche avant de lancer, et il vous est rendu si la génération échoue.</p>
              <div className="la">
                <Link className="lim big" to={start}>{startLabel}</Link>
                <a className="ll" href="#buts">Voir les modèles</a>
              </div>
              <small>{WELCOME > 0 ? `${cauris(WELCOME)} offerts à l’inscription. ` : ''}Compte gratuit, sans abonnement.</small>
            </div>
            <ul className="lm" aria-label="Exemples de modèles">
              {hero.map((r, i) => (
                <li key={r.id}>
                  <img src={PREVIEW[r.id].poster} alt="" width="320" height="400" {...(i < 2 ? { fetchpriority: 'high' } : { loading: 'lazy' })} />
                  <span><b>{r.name}</b>{cauris(recipeCost(r.id))}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="paper" id="buts" aria-labelledby="goals-title">
          <div className="wrap">
            <div className="lt">
              <h2 id="goals-title">Que voulez-vous créer ?</h2>
              <p>Choisissez un but : les modèles qui y mènent s’affichent, avec leur prix.</p>
            </div>
            <ul className="goals">
              {GOALS.map((g) => (
                <li key={g.id} className={`g-${g.id}`}>
                  <button type="button" onClick={() => pick(g.id)}>
                    <img src={PREVIEW[g.poster].poster} alt="" width="640" height="640" loading="lazy" />
                    <span><b>{g.title}</b><small>{g.ids.length} modèle{g.ids.length > 1 ? 's' : ''} · dès {cauris(cheapest(g.ids))}</small></span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="lmod" id="modeles" tabIndex={-1} aria-labelledby="lmod-title">
              <div className="lmh">
                <h2 id="lmod-title">Les modèles</h2>
                <div className="chips" role="group" aria-label="Filtrer par but">
                  {[{ id: 'all', short: 'Tout' }, ...GOALS].map((g) => (
                    <button key={g.id} type="button" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>{g.short}</button>
                  ))}
                </div>
              </div>
              <p className="lcount" role="status">{shown.length} modèle{shown.length > 1 ? 's' : ''}. Chaque prix est celui d’un lancement complet.</p>
              <ul className="mgrid">
                {shown.map((r) => <Model key={r.id} recipe={r} to={start} />)}
              </ul>
            </div>
          </div>
        </section>

        <div className="wrap">
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

          <section className="faq" id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">Vos questions</h2>
            <div>
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="lend" aria-labelledby="lend-title">
            <h2 id="lend-title">Prêt à créer ?</h2>
            <Link className="lim big" to={start}>{startLabel}</Link>
          </section>
        </div>
      </main>

      <footer className="ft">
        <div className="wrap fti">
          <div className="ftb">
            <b>Studio Yeelen</b>
            <p>Des vidéos, des images et des voix par l’IA, pour les créateurs d’Afrique francophone.</p>
          </div>
          <nav aria-label="Pied de page">
            <a href="#buts">Modèles</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#faq">Questions</a>
            {!signedIn && <Link to="/sign-in">Connexion</Link>}
            <Link to={start}>{startLabel}</Link>
          </nav>
          <small>Paiement par Orange Money ou Moov Money · © {new Date().getFullYear()} Studio Yeelen</small>
        </div>
      </footer>
    </div>
  )
}
