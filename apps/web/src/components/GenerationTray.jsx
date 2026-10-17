import { useJobs } from '../lib/jobs.jsx'
import ImageBatch from './generation/ImageBatch.jsx'
import VideoStage from './generation/VideoStage.jsx'
import VoiceStrip from './generation/VoiceStrip.jsx'
import '../styles/generation.css'

/**
 * Générations d'un outil, avec une mise en page propre à chaque média :
 * image → planche de tuiles qui se développent ; vidéo → scène plein panneau ; audio → bandes d'ondes.
 */
export default function GenerationTray({ kind, className = '' }) {
  const { jobs, clearDone } = useJobs()
  const list = jobs.filter((j) => j.kind === kind)
  if (!list.length) return null
  if (kind === 'video') return <VideoStage jobs={list} />

  const Item = kind === 'image' ? ImageBatch : VoiceStrip
  const done = list.filter((j) => j.status !== 'IN_QUEUE' && j.status !== 'IN_PROGRESS').length
  return (
    <section className={`gxt ${className}`} aria-label="Générations">
      <div className="gxt-head">
        <h2>Générations <span>{list.length}</span></h2>
        {done > 0 && <button type="button" onClick={() => clearDone(kind)}>Effacer les terminées</button>}
      </div>
      <ol>{[...list].reverse().map((j) => <Item key={j.id} job={j} />)}</ol>
    </section>
  )
}
