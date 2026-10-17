import { useEffect, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import { gradient } from '../../lib/gradients.js'
import { vividIndex } from '../../lib/media.js'
import { MAX_PARALLEL, jetonLabel, useJobs } from '../../lib/jobs.jsx'
import { useAssets } from '../../lib/assets.jsx'
import SendToMenu from '../SendToMenu.jsx'
import { AssetActions, FailureNotice, RefundNote, StatusChip, StatusLine, clamp, isActive, remaining, seconds } from './shared.jsx'

const poster = (job) => gradient(vividIndex(job.seeds[0]), 'video')

/** Les chapitres de la barre : une portion par étape de la génération, remplie selon l'avancement. */
function Chapters({ job }) {
  // Génération réelle : le fournisseur ne détaille pas ses étapes, on montre une seule barre d'estimation.
  const marks = job.live ? [0, 100] : [0, ...job.steps.map(([p]) => p), 100]
  const names = job.live ? ['Génération'] : ['Préparation', ...job.steps.map(([, m]) => m)]
  return (
    <ol className="vs-chap" aria-hidden="true">
      {names.map((name, i) => {
        const [a, b] = [marks[i], marks[i + 1]]
        const fill = clamp((job.progress - a) / (b - a))
        const current = job.status === 'IN_PROGRESS' && job.progress >= a && job.progress < b
        return (
          <li key={name} className={current ? 'cur' : fill >= 1 ? 'done' : undefined}>
            <i><b style={{ transform: `scaleX(${fill})` }} /></i>
            <span>{name}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** File d'attente vue comme des couloirs : les jobs en cours devant, votre place derrière. */
function Lanes({ job, all }) {
  const running = all.filter((j) => j.status === 'IN_PROGRESS')
  return (
    <div className="vs-lanes" aria-hidden="true">
      {Array.from({ length: MAX_PARALLEL }, (_, i) => {
        const r = running[i]
        return (
          <div key={i} className="lane">
            <span>Worker {i + 1}</span>
            <i><b style={{ transform: `scaleX(${r ? r.progress / 100 : 0})` }} /></i>
            <em>{r ? `${Math.round(r.progress)} %` : 'libre'}</em>
          </div>
        )
      })}
      <div className="lane you"><span>Vous</span><i /><em>n° {job.queuePosition}</em></div>
    </div>
  )
}

function Thumb({ job, on, onPick, url }) {
  return (
    <button type="button" className={`vs-th${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick} aria-label={`${job.title} : ${job.status === 'IN_PROGRESS' ? `${Math.round(job.progress)} %` : job.status}`}>
      <span className="art" style={{ background: poster(job), filter: job.status === 'COMPLETED' ? 'none' : 'saturate(.35) brightness(.7)' }}>
        {url && <video muted preload="metadata" src={`${url}#t=0.1`} tabIndex={-1} aria-hidden="true" />}
      </span>
      <span className="st">
        {job.status === 'IN_PROGRESS' && `${Math.round(job.progress)} %`}
        {job.status === 'IN_QUEUE' && <Icon name="clock" size={14} />}
        {job.status === 'COMPLETED' && <Icon name="check" size={14} />}
        {job.status === 'FAILED' && <Icon name="alert" size={14} />}
        {job.status === 'CANCELED' && <Icon name="close" size={14} />}
      </span>
    </button>
  )
}

/**
 * Scène vidéo : remplace l'état vide du panneau tant qu'une génération existe. Un grand écran 16:9 montre
 * l'aperçu qui se précise, les chapitres de la génération et l'attente ; les autres jobs sont en dessous.
 */
export default function VideoStage({ jobs }) {
  const { running, jobs: all, clearDone } = useJobs()
  const lib = useAssets()
  const lastId = jobs[jobs.length - 1].id
  const [focus, setFocus] = useState(lastId)
  useEffect(() => setFocus(lastId), [lastId])
  const job = jobs.find((j) => j.id === focus) ?? jobs[jobs.length - 1]
  const p = job.status === 'COMPLETED' ? 1 : job.status === 'IN_PROGRESS' ? job.progress / 100 : 0
  const art = poster(job)
  const done = jobs.filter((j) => !isActive(j)).length
  const bad = job.status === 'FAILED' || job.status === 'CANCELED'
  const url = (j) => (j.live && j.status === 'COMPLETED' ? lib.byJob(j.key)[0]?.url : null) // adresse de la vraie vidéo
  const real = url(job)

  return (
    <section className="vs" aria-label="Génération vidéo">
      <div className="vs-wrap">
        <div className={`vs-canvas vs-${job.status.toLowerCase().replace('_', '-')}`} style={{ '--ar': 16 / 9 }}>
          <span className="vs-art" style={{ background: art, filter: job.status === 'COMPLETED' ? 'none' : `blur(${(1 - p) * 38}px) saturate(${0.25 + p * 0.75})` }} />
          {real && <video className="vs-video" src={real} controls playsInline preload="metadata" aria-label={`Vidéo générée : ${job.prompt}`} />}
          {job.status === 'IN_PROGRESS' && <span className="vs-glow" aria-hidden="true" />}
          {!real && <span className="vs-scrim" />}

          <AssetActions job={job} className="vs-act">{job.status === 'COMPLETED' && lib.byJob(job.key)[0] && <SendToMenu asset={lib.byJob(job.key)[0]} iconOnly />}</AssetActions>
          <div className="vs-top">
            <p className="vs-prompt"><b>{job.title}</b>{job.prompt && <span> — {job.prompt}</span>}</p>
            <StatusChip job={job} />
          </div>

          <div className="vs-mid">
            {job.status === 'IN_PROGRESS' && (
              <>
                <p className="vs-pct" aria-hidden="true">{Math.round(job.progress)}<small>%</small></p>
                <p className="vs-step">{job.logs[job.logs.length - 1].msg}</p>
                <p className="vs-eta">≈ {remaining(job)} s {job.live ? '(estimation)' : 'restantes'}</p>
              </>
            )}
            {job.status === 'IN_QUEUE' && (
              <>
                <p className="vs-pct" aria-hidden="true">{job.live && !job.queuePosition ? <i className="gx-spin" style={{ width: 30, height: 30 }} /> : <><small>n°</small>{job.queuePosition}</>}</p>
                <p className="vs-step">{job.live ? 'En file chez le fournisseur' : `En file d’attente · ≈ ${seconds(job.eta)} s`}</p>
                {!job.live && <Lanes job={job} all={all} />}
              </>
            )}
            {job.status === 'COMPLETED' && !real && <span className="vs-play" aria-hidden="true"><Icon name="vid" size={30} /></span>}
            {bad && <div className="vs-fail"><FailureNotice job={job} /><RefundNote job={job} /></div>}
          </div>

          <div className="vs-bot">
            {(job.status === 'IN_PROGRESS' || job.status === 'IN_QUEUE') && <Chapters job={job} />}
            {job.status === 'COMPLETED' && !real && <p className="vs-done">{job.meta ? `${job.meta} · ` : ''}{jetonLabel(job.cost)}</p>}
          </div>
        </div>
      </div>

      <div className="vs-foot">
        {job.status === 'COMPLETED' && <p className="gx-detail"><StatusLine job={job} running={running} /></p>}
      </div>

      {jobs.length > 1 && (
        <div className="vs-strip">
          <div className="vs-strip-head">
            <span>{jobs.length} générations</span>
            {done > 0 && <button type="button" onClick={() => clearDone('video')}>Effacer les terminées</button>}
          </div>
          <div className="vs-ths">
            {[...jobs].reverse().map((j) => <Thumb key={j.id} job={j} url={url(j)} on={j.id === job.id} onPick={() => setFocus(j.id)} />)}
          </div>
        </div>
      )}
    </section>
  )
}
