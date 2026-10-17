import { useEffect, useState } from 'react'
import Icon from '../lib/icons.jsx'
import { gradient } from '../lib/gradients.js'
import { useAssets } from '../lib/assets.jsx'
import { blobGet, clipFor, synthWav } from '../lib/media.js'
import SpotPlayer from './SpotPlayer.jsx'

const cache = new Map() // id → URL d'objet (assets importés, audio synthétisé)

export const fmtSecs = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)

/** URL lisible d'un asset (lecture, aperçu), ou null s'il n'en a pas (image générée : dégradé CSS). */
export function useAssetUrl(asset) {
  const { files } = useAssets()
  const [url, setUrl] = useState(() => asset.url ?? cache.get(asset.id) ?? null)
  useEffect(() => {
    if (asset.url) return setUrl(asset.url) // fichier réel : l'adresse suffit
    if (cache.has(asset.id)) return setUrl(cache.get(asset.id))
    let alive = true
    const done = (u) => { cache.set(asset.id, u); if (alive) setUrl(u) }
    if (asset.source === 'upload') {
      const f = files.current.get(asset.id)
      if (f) done(URL.createObjectURL(f))
      else blobGet(asset.id).then((b) => b && done(URL.createObjectURL(b)))
    } else if (asset.kind === 'audio') {
      done(URL.createObjectURL(synthWav(asset.seed, asset.secs ?? 5)))
    } else if (asset.kind === 'video') {
      done(clipFor(asset.seed))
    } else {
      setUrl(null)
    }
    return () => { alive = false }
  }, [asset.id, asset.url, asset.source, asset.kind, asset.seed, asset.secs, files])
  return url
}

const bars = (asset) => Array.from({ length: 28 }, (_, k) => 18 + ((Math.abs(asset.seed ?? asset.name.length * 7) + 3) * (k + 5) * 53) % 76)

/** Aperçu d'un asset : vignette compacte, ou grand aperçu lisible (`large`) avec ses commandes. */
export default function AssetThumb({ asset, large = false }) {
  const url = useAssetUrl(asset)
  const art = asset.art ? gradient(asset.art.index, asset.art.palette) : null

  if (asset.kind === 'audio') {
    return (
      <div className={`at at-audio${large ? ' large' : ''}`}>
        <div className="at-wave" aria-hidden="true">{bars(asset).map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
        {large ? (url && <audio controls src={url} aria-label={`Écouter : ${asset.name}`} />) : <><Icon name="sound" size={16} /><span className="at-dur">{fmtSecs(asset.secs)}</span></>}
      </div>
    )
  }
  if (asset.kind === 'video' && asset.spot && large) return <div className="at-spot"><SpotPlayer manifest={asset.spot} /></div>
  if (asset.kind === 'video') {
    return (
      <div className={`at at-video${large ? ' large' : ''}`} style={asset.source === 'generated' && !asset.url ? { background: art } : undefined}>
        {large && url ? <video controls muted playsInline preload="metadata" src={url} aria-label={`Lire : ${asset.name}`} /> : (
          <>
            {(asset.source === 'upload' || asset.url) && url && <video muted preload="metadata" src={`${url}#t=0.1`} tabIndex={-1} aria-hidden="true" />}
            <span className="at-play" aria-hidden="true"><Icon name="play" size={16} fill="currentColor" /></span>
            {asset.secs != null && <span className="at-dur">{fmtSecs(asset.secs)}</span>}
            {asset.spot && <span className="at-badge">Spot</span>}
          </>
        )}
      </div>
    )
  }
  return (
    <div className={`at at-image${large ? ' large' : ''}`} style={asset.source === 'generated' && !asset.url ? { background: art } : undefined}>
      {(asset.source === 'upload' || asset.url) && url && <img src={url} alt={large ? asset.name : ''} loading={large ? 'eager' : 'lazy'} />}
    </div>
  )
}
