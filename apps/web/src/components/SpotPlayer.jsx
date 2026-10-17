import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import { gradient } from '../lib/gradients.js'
import { clipFor, synthWav } from '../lib/media.js'
import { brandVars, useLogoUrl } from '../lib/brand.jsx'
import EndCard from './EndCard.jsx'

/**
 * Aperçu monté d'un spot : vidéo, voix, sous-titres synchronisés et carte finale, comme le fichier final.
 * Le montage réel (ffmpeg) est fait côté serveur à partir du même plan (`manifest`) ; ceci en est le rendu de contrôle.
 *
 * L'horloge tourne dans une boucle d'animation et écrit directement dans le DOM (barre, temps) : React n'est sollicité
 * que lorsque la sous-titre affichée ou la carte finale change, pas à chaque image.
 */
export default function SpotPlayer({ manifest }) {
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [capIndex, setCapIndex] = useState(-1)
  const [ended, setEnded] = useState(false)
  const video = useRef(null)
  const audio = useRef(null)
  const fill = useRef(null)
  const track = useRef(null)
  const timeEl = useRef(null)
  const now = useRef(0) // position de lecture en secondes
  const clock = useRef({ start: 0, from: 0 })
  const m = manifest
  const logoUrl = useLogoUrl(m.brand?.logoId)
  const voiceUrl = useMemo(() => URL.createObjectURL(synthWav(m.voice.seed, m.voice.secs)), [m.voice.seed, m.voice.secs])
  useEffect(() => () => URL.revokeObjectURL(voiceUrl), [voiceUrl])

  const paint = (t) => {
    now.current = t
    if (fill.current) fill.current.style.transform = `scaleX(${t / m.duration})`
    if (timeEl.current) timeEl.current.textContent = `${Math.floor(t)} / ${m.duration} s`
    track.current?.setAttribute('aria-valuenow', String(Math.round(t)))
    setCapIndex(m.captions.findIndex((c) => t >= c.start && t < c.end))
    setEnded(t >= m.endCard.start)
  }

  useEffect(() => {
    if (!playing) return
    clock.current = { start: performance.now(), from: now.current }
    video.current?.play().catch(() => {})
    if (audio.current) { audio.current.currentTime = now.current % m.voice.secs; audio.current.play().catch(() => {}) }
    let raf
    const tick = () => {
      let t = clock.current.from + (performance.now() - clock.current.start) / 1000
      if (t >= m.duration) {
        t = 0
        clock.current = { start: performance.now(), from: 0 }
        if (audio.current) { audio.current.currentTime = 0; audio.current.play().catch(() => {}) }
      }
      paint(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); video.current?.pause(); audio.current?.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const caption = capIndex >= 0 ? m.captions[capIndex] : null
  const art = gradient(m.video.art.index, m.video.art.palette)

  return (
    <div className="spp">
      <div className="spp-screen" style={{ background: art, ...(m.brand ? brandVars(m.brand) : null) }}>
        <video ref={video} src={clipFor(m.video.seed)} muted loop playsInline preload="metadata" aria-hidden="true" />
        <audio ref={audio} src={voiceUrl} muted={muted} preload="auto" />
        {caption && !ended && <p className="spp-cap" aria-live="off">{caption.text}</p>}
        {ended && <EndCard title={m.endCard.title} offer={m.endCard.offer} price={m.endCard.price} whatsapp={m.endCard.whatsapp} logoUrl={logoUrl} />}
        {!playing && (
          <button type="button" className="spp-play" onClick={() => setPlaying(true)} aria-label="Lire le spot">
            <Icon name="play" size={28} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="spp-bar">
        <button type="button" className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Lecture'}>
          {playing ? <Icon name="pause" size={18} /> : <Icon name="play" size={18} fill="currentColor" />}
        </button>
        <div className="spp-track" ref={track} role="progressbar" aria-label="Position de lecture" aria-valuemin={0} aria-valuemax={m.duration} aria-valuenow={0}><i ref={fill} style={{ transform: 'scaleX(0)' }} /></div>
        <span className="spp-time" ref={timeEl}>0 / {m.duration} s</span>
        <button type="button" className="icon-btn" onClick={() => setMuted((x) => !x)} aria-pressed={!muted} aria-label="Son" title={muted ? 'Activer le son' : 'Couper le son'}>
          <Icon name={muted ? 'mute' : 'sound'} size={18} />
        </button>
      </div>
    </div>
  )
}
