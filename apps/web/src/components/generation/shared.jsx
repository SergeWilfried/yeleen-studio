import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { FAILURES, jetonLabel, jetons, useJobs } from '../../lib/jobs.jsx'

export const LABEL = { IN_QUEUE: 'En file d’attente', IN_PROGRESS: 'En cours', COMPLETED: 'Terminée', FAILED: 'Échec', CANCELED: 'Annulée' }
export const isActive = (j) => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS'
export const seconds = (ms) => Math.max(1, Math.round(ms / 1000))
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n))
export const remaining = (job) => seconds(job.duration * (1 - job.progress / 100))

export function StatusChip({ job }) {
  return <span className={`gx-chip gx-chip-${job.status.toLowerCase().replace('_', '-')}`}>{LABEL[job.status]}</span>
}

/** Phrase d'état unique, réutilisée par les trois mises en page. */
export function StatusLine({ job, running }) {
  if (job.live && job.status === 'IN_QUEUE') return <>{job.queuePosition > 0 ? `Position ${job.queuePosition} · ` : ''}en file chez le fournisseur</>
  if (job.live && job.status === 'IN_PROGRESS') return <>≈ {Math.round(job.progress)} % (estimation) · {job.logs[job.logs.length - 1].msg}</>
  if (job.status === 'IN_QUEUE') return <>Position {job.queuePosition} · attente ≈ {seconds(job.eta)} s · {running} en cours (limite : 2)</>
  if (job.status === 'IN_PROGRESS') return <>{Math.round(job.progress)} % · ≈ {remaining(job)} s restantes · {job.logs[job.logs.length - 1].msg}</>
  if (job.status === 'COMPLETED') return <>Terminée en {seconds(job.finishedAt - job.startedAt)} s · {jetonLabel(job.cost)}{job.attempt > 1 ? ` · tentative ${job.attempt}` : ''}</>
  return null
}

export function FailureNotice({ job }) {
  if (job.status !== 'FAILED') return null
  const f = FAILURES[job.failure]
  return (
    <div className="gx-err" role="alert">
      <b>{f.message}</b>
      <span>{f.hint}</span>
      {job.failure === 'insufficient' && <Link className="gx-topup" to="/recharge">Recharger mes cauris</Link>}
    </div>
  )
}

export function RefundNote({ job }) {
  if ((job.status !== 'FAILED' && job.status !== 'CANCELED') || !(job.refund > 0)) return null
  return (
    <p className="gx-refund">
      <Icon name="check" size={14} />Remboursé : +{jetonLabel(job.refund)}{job.status === 'CANCELED' && job.refund < job.cost ? ' (part non consommée)' : ''}
    </p>
  )
}

/**
 * Actions de l'asset, en icônes empilées sur l'asset lui-même (à une position fixe) :
 * stop (en file / en cours), refaire (↺ avec son coût), modifier la description (✎) et retirer (corbeille).
 * `dir="row"` les aligne horizontalement (bandes audio).
 */
export function AssetActions({ job, dir = 'col', className = '', children }) {
  const { cancel, retry, rerun, dismiss } = useJobs()
  const { status } = job
  const retryable = job.failure && FAILURES[job.failure].retry
  const cost = jetons(job.cost)
  const focusPrompt = () => document.querySelector('[data-prompt]')?.focus()
  const redo = (label, fn, main) => (
    <button type="button" className={main ? 'main' : undefined} onClick={fn} title={`${label} · ${jetonLabel(job.cost)}`} aria-label={`${label} : ${job.title} (${jetonLabel(job.cost)})`}>
      <Icon name="revert" size={17} /><span>{cost}</span>
    </button>
  )
  return (
    <div className={`ax ${dir === 'row' ? 'row' : ''} ${className}`}>
      {children}
      {isActive(job) && (
        <button type="button" onClick={() => cancel(job.id)} title={status === 'IN_QUEUE' ? 'Annuler · remboursé en entier' : job.live ? 'Annuler · déjà en cours chez le fournisseur : non remboursé' : 'Annuler · part non consommée remboursée'} aria-label={`Annuler : ${job.title}`}>
          <Icon name="close" size={17} />
        </button>
      )}
      {status === 'COMPLETED' && redo('Régénérer', () => rerun(job))}
      {status === 'FAILED' && retryable && redo('Réessayer', () => retry(job), true)}
      {status === 'FAILED' && !retryable && (
        <button type="button" className="main" onClick={focusPrompt} title="Modifier la description" aria-label="Modifier la description">
          <Icon name="pencil" size={17} />
        </button>
      )}
      {status === 'CANCELED' && redo('Relancer', () => retry(job))}
      {!isActive(job) && (
        <button type="button" onClick={() => dismiss(job.id)} title="Retirer" aria-label={`Retirer : ${job.title}`}>
          <Icon name="trash" size={17} />
        </button>
      )}
    </div>
  )
}
