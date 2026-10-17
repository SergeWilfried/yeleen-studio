import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAssets } from './assets.jsx'
import { jetons, useJobs } from './jobs.jsx'
import { IMAGE_MODEL, MONTAGE_COST, VIDEO_MODEL, VOICE_MODEL, adSeconds, buildManifest, digits, estimate, voiceSecs } from '@studio/spot'
import { imageCost, videoCost, voiceCost } from '@studio/catalog'

/**
 * Orchestration d'un spot. Étapes : visuel (sauté si photo) et voix en parallèle → vidéo (animée à partir du visuel)
 * → montage quand la vidéo et la voix sont prêtes. Chaque étape est une génération facturée, remboursée en cas d'échec.
 * Avec fal, c'est un workflow à deux branches ; ici le même déroulé est piloté par l'état des générations.
 */
const Ctx = createContext(null)
export const useSpots = () => useContext(Ctx)
export const STAGES = ['image', 'voice', 'video', 'montage']

const initial = (id, brief, lines, productAssetId, brand) => {
  const est = estimate(lines, Boolean(productAssetId))
  const stage = (use) => ({ status: use ? 'waiting' : 'skipped', jobId: null, jobKey: null, assetId: null, error: null, retry: 0 })
  return {
    id, brief, lines, productAssetId, brand, secs: est.secs, cost: est.total, parts: est.parts, status: 'running', createdAt: Date.now(), resultAssetId: null,
    stages: { image: stage(!productAssetId), voice: stage(true), video: stage(true), montage: stage(true) },
  }
}

export function SpotsProvider({ children }) {
  const { jobs, submit, cancel, balance } = useJobs()
  const { assets } = useAssets()
  const [run, setRun] = useState(null)
  const started = useRef(new Set())
  const seq = useRef(0)

  const patch = useCallback((id, key, p) => setRun((r) => (r && r.id === id ? { ...r, stages: { ...r.stages, [key]: { ...r.stages[key], ...p } } } : r)), [])

  const startStage = useCallback((r, key) => {
    const guard = `${r.id}:${key}:${r.stages[key].retry}`
    if (started.current.has(guard)) return
    started.current.add(guard)
    const { brief, lines } = r
    const look = r.brand?.apply ? r.brand.style : '' // style visuel de la marque, ajouté aux prompts image et vidéo
    const asset = (id) => assets.find((a) => a.id === id)
    let spec
    if (key === 'voice') {
      spec = { kind: 'audio', title: 'Voix du spot', prompt: lines.join(' '), cost: voiceCost(VOICE_MODEL, lines.join(' ').length), secs: voiceSecs(lines), count: 1, meta: `${brief.voice} · ${brief.lang === 'fr' ? 'Français' : 'English'}`, spot: { runId: r.id, stage: key } }
    } else if (key === 'image') {
      spec = { kind: 'image', title: IMAGE_MODEL.name, prompt: `${brief.offer}, photo publicitaire du produit, ${brief.name}`, brandStyle: look || undefined, cost: imageCost(IMAGE_MODEL, '1K', 1), count: 1, meta: `1 × 1K · visuel du spot${look ? ' · style de la marque' : ''}`, spot: { runId: r.id, stage: key } }
    } else if (key === 'video') {
      const input = r.productAssetId ?? r.stages.image.assetId
      spec = { kind: 'video', title: VIDEO_MODEL.name, prompt: `Mouvement de caméra doux autour du produit, ambiance ${brief.tone === 'bold' ? 'dynamique' : brief.tone === 'premium' ? 'luxueuse' : 'chaleureuse'}`, brandStyle: look || undefined, cost: videoCost(VIDEO_MODEL, r.secs, '720p'), secs: r.secs, count: 1, meta: `${r.secs} s · 720p · 9:16 · spot`, input: { assetId: input }, spot: { runId: r.id, stage: key } }
    } else {
      const v = asset(r.stages.video.assetId)
      const a = asset(r.stages.voice.assetId)
      const manifest = buildManifest({ brief, lines, secs: r.secs, video: { seed: v.seed, art: v.art }, voice: { seed: a.seed, secs: voiceSecs(lines) }, brand: r.brand?.colors ? { ...r.brand.colors, logoId: r.brand.logoId } : null })
      spec = { kind: 'montage', title: 'Montage du spot', prompt: '', cost: MONTAGE_COST, secs: r.secs, count: 1, meta: `Spot · 9:16 · ${r.secs} s`, spot: { runId: r.id, manifest } }
    }
    const res = submit(spec)
    if (res.ok) patch(r.id, key, { status: 'running', jobId: res.job.id, jobKey: res.job.key, error: null })
    else patch(r.id, key, { status: 'waiting', error: `Solde insuffisant : il manque ${jetons(res.missing)} jetons pour cette étape.`, blocked: true })
  }, [assets, submit, patch])

  useEffect(() => {
    if (!run || run.status === 'canceled' || run.status === 'done') return
    const st = run.stages
    for (const key of STAGES) {
      const s = st[key]
      if (s.status !== 'running') continue
      const job = jobs.find((j) => j.id === s.jobId)
      if (!job) continue
      if (job.status === 'COMPLETED') {
        const a = assets.find((x) => x.origin?.jobKey === s.jobKey)
        if (a) patch(run.id, key, { status: 'done', assetId: a.id })
      } else if (job.status === 'FAILED') patch(run.id, key, { status: 'failed', error: 'La génération a échoué. Les jetons de cette étape sont remboursés.' })
      else if (job.status === 'CANCELED') patch(run.id, key, { status: 'failed', error: 'Étape annulée.' })
    }
    const ready = {
      image: true,
      voice: true,
      video: st.image.status === 'done' || st.image.status === 'skipped',
      montage: st.video.status === 'done' && st.voice.status === 'done',
    }
    for (const key of STAGES) if (st[key].status === 'waiting' && !st[key].blocked && ready[key]) startStage(run, key)

    if (st.montage.status === 'done') {
      setRun((r) => (r && r.id === run.id ? { ...r, status: 'done', resultAssetId: st.montage.assetId } : r))
      return
    }
    const failed = STAGES.some((k) => st[k].status === 'failed')
    const blocked = STAGES.some((k) => st[k].blocked)
    const busy = STAGES.some((k) => st[k].status === 'running')
    const next = failed ? (busy ? 'running' : 'failed') : blocked ? 'blocked' : 'running'
    if (next !== run.status) setRun((r) => (r && r.id === run.id ? { ...r, status: next } : r))
  }, [run, jobs, assets, patch, startStage])

  const start = useCallback(({ brief, lines, productAssetId, brand }) => {
    setRun(initial(`spot-${Date.now().toString(36)}-${++seq.current}`, brief, lines, productAssetId, brand))
  }, [])

  const value = useMemo(() => ({
    run,
    balance,
    start,
    retry: (key) => run && setRun((r) => ({ ...r, status: 'running', stages: { ...r.stages, [key]: { ...r.stages[key], status: 'waiting', error: null, blocked: false, retry: r.stages[key].retry + 1 } } })),
    cancel: () => {
      if (!run) return
      STAGES.forEach((k) => { const s = run.stages[k]; if (s.status === 'running') cancel(s.jobId) })
      setRun((r) => (r ? { ...r, status: 'canceled' } : r))
    },
    reset: () => setRun(null),
  }), [run, balance, start, cancel])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { digits }
