import { useEffect, useRef, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import { useAssetUrl } from '../AssetThumb.jsx'
import { useJobs } from '../../lib/jobs.jsx'
import { useAssets } from '../../lib/assets.jsx'
import SendToMenu from '../SendToMenu.jsx'
import { AssetActions, FailureNotice, RefundNote, StatusChip, StatusLine, isActive } from './shared.jsx'

const BARS = 56

/** Disque de lecture d'une sortie terminée : écoute directe, sans quitter la bande. */
function PlayDisc({ asset }) {
  const url = useAssetUrl(asset)
  const [playing, setPlaying] = useState(false)
  const el = useRef(null)
  useEffect(() => () => el.current?.pause(), [])
  const toggle = () => {
    if (!url) return
    if (!el.current) { el.current = new window.Audio(url); el.current.onended = () => setPlaying(false) }
    if (playing) { el.current.pause(); setPlaying(false) } else { el.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }
  return (
    <button type="button" className="vo-disc vo-play" onClick={toggle} disabled={!url} aria-pressed={playing} aria-label={`${playing ? 'Mettre en pause' : 'Écouter'} : ${asset.name}`}>
      <Icon name={playing ? 'pause' : 'play'} size={16} fill="currentColor" />
    </button>
  )
}

/** Bande audio : la forme d'onde se révèle au fil de la génération ; un disque d'état précède chaque sortie. */
export default function VoiceStrip({ job }) {
  const { running } = useJobs()
  const lib = useAssets()
  const outs = job.status === 'COMPLETED' ? lib.byJob(job.key) : []
  const first = outs[0] ?? null
  const failed = job.status === 'FAILED' || job.status === 'CANCELED'
  const reveal = job.status === 'COMPLETED' ? BARS : job.status === 'IN_PROGRESS' ? Math.floor((job.progress / 100) * BARS) : 0

  return (
    <li className={`vo vo-${job.status.toLowerCase().replace('_', '-')}`}>
      <div className="vo-head">
        <p className="ib-title"><b>{job.title}</b>{job.prompt && <span> — {job.prompt}</span>}</p>
        {job.meta && <span className="ib-meta">{job.meta}</span>}
        <StatusChip job={job} />
      </div>

      {failed ? (
        <div className="ib-fail"><div><FailureNotice job={job} /><RefundNote job={job} /></div><AssetActions job={job} dir="row" className="inline" /></div>
      ) : (
        <div className="vo-rows">
        {job.seeds.map((seed, o) => (
          <div key={o} className="vo-row">
            {outs[o] ? <PlayDisc asset={outs[o]} /> : <span className="vo-disc" aria-hidden="true">{job.status === 'COMPLETED' ? <Icon name="sound" size={18} /> : <i className="gx-spin" />}</span>}
            <div className="vo-wave" role="img" aria-label={job.status === 'COMPLETED' ? `Sortie audio ${o + 1}` : `Sortie audio ${o + 1} en cours`}>
              {Array.from({ length: BARS }, (_, k) => (
                <i key={k} className={k < reveal ? 'on' : undefined} style={{ height: `${18 + ((seed + o) * (k + 5) * 53) % 76}%` }} />
              ))}
            </div>
          </div>
        ))}
        <AssetActions job={job} dir="row" className="vo-act">{first && <SendToMenu asset={first} iconOnly />}</AssetActions>
        </div>
      )}

      {isActive(job) || job.status === 'COMPLETED' ? <p className="gx-detail"><StatusLine job={job} running={running} /></p> : null}
    </li>
  )
}
