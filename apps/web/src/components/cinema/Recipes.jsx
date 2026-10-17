import { useEffect, useRef, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import AssetThumb from '../AssetThumb.jsx'
import Menu from '../Menu.jsx'
import MentionTextarea from '../MentionTextarea.jsx'
import { ATTACH_PATTERN } from '../../lib/mentions.js'
import montage from '../../assets/hero/montage.jpg'
import montageVideo from '../../assets/hero/montage.mp4'
import portrait from '../../assets/hero/influenceur.jpg'
import scene from '../../assets/hero/image.jpg'
import pubs from '../../assets/hero/pubs.jpg'
import pubsVideo from '../../assets/hero/pubs.mp4'
import { jetons } from '../../lib/jobs.jsx'
import { RECIPES, recipeCost, recipeIssue } from '@studio/catalog/recipes'

const STEP_LABEL = { IN_QUEUE: 'En attente', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', FAILED: 'Échec', CANCELED: 'Annulé' }

// Aperçus provisoires : fal ne publie pas de vignette utilisable, on réutilise les visuels de l'application.
const PREVIEW = {
  'wf-weather': { poster: scene },
  'wf-photo-to-video': { poster: portrait },
  'wf-fan-cam': { poster: pubs, video: pubsVideo },
  'wf-kling-multi-shot-creator': { poster: montage, video: montageVideo },
  'wf-documentary': { poster: scene },
}

/** Aperçu d'un modèle : l'image, et la vidéo au survol ou au focus. */
function Preview({ id }) {
  const p = PREVIEW[id]
  const play = (e) => e.currentTarget.querySelector('video')?.play().catch(() => {})
  const stop = (e) => e.currentTarget.querySelector('video')?.pause()
  return (
    <span className="rc-pv" onMouseEnter={play} onMouseLeave={stop}>
      <img src={p.poster} alt="" loading="lazy" />
      {p.video && <video src={p.video} poster={p.poster} muted loop playsInline preload="none" aria-hidden="true" />}
    </span>
  )
}

/** Rangée de cartes qui défile à l'horizontale, avec des flèches qui s'éteignent aux extrémités. */
function Row({ children, label }) {
  const box = useRef(null)
  const [end, setEnd] = useState({ start: true, end: false })
  const measure = () => {
    const el = box.current
    if (!el) return
    const next = { start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 }
    setEnd((e) => (e.start === next.start && e.end === next.end ? e : next))
  }
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [children])
  const by = (dir) => box.current.scrollBy({ left: dir * Math.max(240, box.current.clientWidth * 0.8), behavior: 'smooth' })
  return (
    <div className="rc-row">
      <button type="button" className="rc-nav" aria-label="Modèles précédents" disabled={end.start} onClick={() => by(-1)}><Icon name="chevL" size={18} /></button>
      <ul className="rc-cards" aria-label={label} ref={box} onScroll={measure}>{children}</ul>
      <button type="button" className="rc-nav" aria-label="Modèles suivants" disabled={end.end} onClick={() => by(1)}><Icon name="chevR" size={18} /></button>
    </div>
  )
}

/** La galerie des modèles, comme la vitrine de fal : une grande vignette par workflow, en rangée. */
export function RecipeCards({ value, onPick }) {
  return (
    <div className="rc-gal">
      <Row label="Modèles">
        {RECIPES.map((e) => (
          <li key={e.id}>
            <button type="button" className="rc-card" aria-pressed={value === e.id} onClick={() => onPick(e.id)}>
              <Preview id={e.id} />
              <b>{e.name}</b>
              <span className="rc-d">{e.blurb}</span>
              <span className="rc-m"><Icon name="sparkle" size={13} />{jetons(recipeCost(e.id))}</span>
            </button>
          </li>
        ))}
      </Row>
    </div>
  )
}

/** Avancement du lancement en cours. Un workflow fal peut durer plusieurs minutes : on le dit tant qu'il n'est pas terminé. */
export function RunStrip({ jobs, onDone }) {
  const active = jobs.some((j) => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')
  return (
    <div className="rc-runbar">
      <ol className="rc-run" aria-label="Avancement du modèle">
        {jobs.map((j) => (
          <li key={j.id} data-s={j.status}>
            <span className="rc-dot" aria-hidden="true">{j.status === 'COMPLETED' ? <Icon name="check" size={12} /> : <Icon name="clock" size={12} />}</span>
            <b>{j.spec.recipe.label}</b>
            <span>{STEP_LABEL[j.status]}{active ? ' · cela peut prendre plusieurs minutes' : ''}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="rc-back" onClick={onDone}>Autres modèles</button>
    </div>
  )
}

/**
 * Formulaire d'un modèle : la même barre que les créations Image et Vidéo (pièces jointes en vignettes, + pour importer,
 * zone de texte, puces, bouton Générer avec le prix).
 */
export function RecipeForm({ id, text, onText, photos, onAdd, onRemove, onPick, error, onRun }) {
  const r = RECIPES.find((x) => x.id === id)
  const issue = recipeIssue(id, { text, photos })
  const cost = recipeCost(id)
  const attached = r.photos.filter((p) => photos[p.key])
  return (
    <div className="cn-comp">
      {attached.length > 0 && (
        <ul className="cn-strip" aria-label="Photos jointes">
          {attached.map((p) => (
            <li key={p.key}>
              <button type="button" className="cn-th" onClick={onAdd} aria-label={`${p.label} : ${photos[p.key].name}. Remplacer`} title={`${p.label} : remplacer`}>
                <AssetThumb asset={photos[p.key]} />
                <span className="cn-no" aria-hidden="true">{r.photos.indexOf(p) + 1}</span>
              </button>
              <button type="button" className="cn-rm" onClick={() => onRemove(p.key)} aria-label={`Retirer : ${p.label}`}><Icon name="close" size={11} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="cn-edit">
        <div className="cn-field">
          {r.text ? (
            <MentionTextarea value={text} onChange={onText} items={[]} pattern={ATTACH_PATTERN} isRef={() => false} roles={{}} placeholder={r.text.placeholder} aria-label={r.text.label} rows={2} />
          ) : (
            <p className="rc-notext">{r.blurb}. Ajoutez les photos avec +.</p>
          )}
          {(error || issue) && <p className={`cn-hint${error ? ' bad' : ''}`} role={error ? 'alert' : 'status'}>{error || issue}</p>}
        </div>
        <button type="button" className="cn-gen" disabled={Boolean(issue)} onClick={onRun} title={issue ?? undefined}>
          <b>Générer</b><span><Icon name="sparkle" size={14} />{jetons(cost)}</span>
        </button>
        <div className="cn-bar">
          <div className="cn-pair">
            <button type="button" onClick={onAdd} aria-label={`Ajouter : ${r.photos.map((p) => p.label.toLowerCase()).join(', ')}`} title={r.photos.map((p) => p.label).join(' · ')}><Icon name="plus" size={18} /></button>
          </div>
          <Menu items={RECIPES.map((x) => ({ id: x.id, title: x.name, icon: x.icon }))} value={id} onChange={onPick} label="Modèle" menuWidth={280} className="cn-chip" listClass="cn-pop"><Icon name={r.icon} size={16} /><span>{r.name}</span></Menu>
        </div>
      </div>
    </div>
  )
}
