import { useEffect, useState } from 'react'
import { durationOptions, videoCost } from '@studio/catalog'

export const QUALITY = [
  { id: 'standard', title: 'Standard', desc: 'Génération pleine qualité à la résolution choisie.' },
  { id: 'draft', title: 'Brouillon', desc: 'Génère en 480p, à agrandir en 1080p plus tard en conservant le détail.' },
]
export const MODES = [
  { id: 'manual', title: 'Manuel', desc: 'Vous décrivez chaque plan.' },
  { id: 'auto', title: 'Auto', desc: 'Le modèle propose le découpage à partir de votre idée.' },
]
export const DURATIONS = [2, 3, 5, 8, 10] // durées proposées pour un plan (Kling accepte des plans dès 1 s ; la durée totale reste bornée par le modèle)
export const RESOLUTIONS = ['720p', '1080p', '4K']
export const RATIOS = ['16:9', '9:16', '1:1', '4:5']
export const MAX_PLANS = 4
const COST_PER_SECOND = 12
const RES_COST = { '720p': 1, '1080p': 1.5, '4K': 3 }

export const next = (list, v) => list[(list.indexOf(v) + 1) % list.length]

/** État partagé des panneaux de génération vidéo (créer, modifier). */
const closest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))

/**
 * État partagé des panneaux de génération vidéo. Avec un `model` (catalogue), les options (durées, résolutions, format,
 * son, multi-plans) et le coût viennent de ses capacités ; sans modèle (onglet Modifier), les valeurs par défaut s'appliquent.
 */
export default function useGenSettings(model, { audioSecs = null } = {}) {
  const caps = model?.caps
  const [quality, setQuality] = useState('standard')
  const [mode, setMode] = useState('manual')
  const [plans, setPlans] = useState([{ text: '', dur: 5 }])
  const [active, setActive] = useState(0)
  const [res, setRes] = useState('720p')
  const [ratio, setRatio] = useState('16:9')
  const [sound, setSound] = useState(true)
  const [fps, setFps] = useState(25)
  const [camera, setCamera] = useState('none')
  const [refs, setRefs] = useState({}) // « @mot-clé » → asset de la bibliothèque, pour les références citées dans les plans

  const picks = caps ? durationOptions(caps, res, fps) : DURATIONS
  const resolutions = caps ? caps.resolutions : RESOLUTIONS // null : la résolution suit l'image de départ
  const ratios = caps ? (caps.ratios ?? (caps.ratio === 'image' ? null : RATIOS)) : RATIOS // null : le format suit l'image
  const multiAllowed = caps ? caps.multiShot : true
  const soundMode = caps ? caps.audio : 'toggle' // toggle | always

  // Ramène les valeurs en cours dans ce que le modèle accepte (au changement de modèle, de résolution ou de fréquence).
  const modelId = model?.id
  useEffect(() => {
    if (!caps) return
    setPlans((ps) => (caps.multiShot ? ps : ps.slice(0, 1)).map((p) => ({ ...p, dur: !picks.length || picks.includes(p.dur) ? p.dur : closest(picks, p.dur) })))
    if (!caps.multiShot) setActive(0)
    if (resolutions && !resolutions.includes(res)) setRes(resolutions.includes('768p') ? '768p' : resolutions[0])
    if (ratios && !ratios.includes(ratio)) setRatio(ratios[0])
    if (caps.fps && !caps.fps.includes(fps)) setFps(caps.fps.includes(25) ? 25 : caps.fps[0])
    if (caps.audio === 'always') setSound(true)
    if (!caps.cameraMotion) setCamera('none')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, res, fps])

  // Quand le format peut suivre l'image (« auto »), c'est le choix par défaut d'un nouveau modèle.
  useEffect(() => {
    if (ratios?.includes('auto')) setRatio('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId])

  const multi = plans.length > 1
  const draft = !caps && quality === 'draft'
  const fromAudio = Boolean(caps?.duration?.fromAudio) // la durée est celle du fichier audio fourni
  const total = fromAudio ? (audioSecs ?? 0) : plans.reduce((n, p) => n + p.dur, 0)
  const cost = caps ? videoCost(model, fromAudio ? Math.max(total, caps.duration.fromAudio.min) : total, res, { sound: caps.audio === 'always' || sound }) : Math.round(COST_PER_SECOND * total * RES_COST[res] * (draft ? 0.3 : 1))
  const patch = (i, v) => setPlans((ps) => ps.map((p, k) => (k === i ? { ...p, ...v } : p)))

  return {
    quality, setQuality, mode, setMode, plans, active, setActive, res, setRes, ratio, setRatio, sound, setSound,
    picks, resolutions, ratios, multiAllowed, soundMode, caps, fromAudio, fps, setFps, camera, setCamera, refs, addRef: (token, assetId) => setRefs((r) => ({ ...r, [token]: assetId })),
    multi, draft, total, cost, current: plans[active], ready: plans.some((p) => p.text.trim()), patch,
    addPlan: () => {
      setPlans((ps) => [...ps, { text: '', dur: 5 }])
      setActive(plans.length)
    },
    removePlan: (i) => {
      setPlans((ps) => ps.filter((_, k) => k !== i))
      setActive((a) => Math.max(0, a >= i ? a - 1 : a))
    },
  }
}
