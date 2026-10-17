import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAssets } from './assets.jsx'
import { jetons, useJobs } from './jobs.jsx'
import { useToast } from './toasts.jsx'
import { entryById, stepCost, stepSecs } from '@studio/catalog/chains'

/**
 * Exécution des chaînes. Chaque étape est une génération (job) ; quand elle se termine, son asset alimente l'étape
 * suivante. Les jetons sont débités étape par étape : une étape qui échoue est remboursée et les suivantes ne
 * sont jamais facturées. Avec fal, ce moteur est remplacé par un seul appel `workflows/execute` dont les
 * événements de nœud pilotent le même état.
 */
const Ctx = createContext(null)
export const useChains = () => useContext(Ctx)

const SAVED = 'studio.chains.v1'
const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || '[]') } catch { return [] } }

const patchStep = (run, i, patch) => ({ ...run, steps: run.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
const upd = (state, id, fn) => state.map((r) => (r.id === id ? fn(r) : r))

function reducer(state, a) {
  switch (a.type) {
    case 'START': return [...state, a.run]
    case 'STEP_STARTED': return upd(state, a.id, (r) => patchStep({ ...r, status: 'running' }, a.i, { status: 'running', jobId: a.jobId, jobKey: a.jobKey, error: null }))
    case 'STEP_DONE': return upd(state, a.id, (r) => patchStep(r, a.i, { status: 'done', assetId: a.assetId }))
    case 'STEP_BLOCKED': return upd(state, a.id, (r) => patchStep({ ...r, status: 'blocked' }, a.i, { status: 'waiting', error: a.error }))
    case 'STEP_FAILED': return upd(state, a.id, (r) => ({ ...r, status: 'failed', steps: r.steps.map((s, k) => (k === a.i ? { ...s, status: 'failed', error: a.error } : k > a.i ? { ...s, status: 'skipped' } : s)) }))
    case 'RUN_DONE': return upd(state, a.id, (r) => ({ ...r, status: 'done', finishedAt: Date.now() }))
    case 'RUN_CANCELED': return upd(state, a.id, (r) => ({ ...r, status: 'canceled', steps: r.steps.map((s) => (s.status === 'done' ? s : { ...s, status: 'canceled' })) }))
    case 'RESUME': return upd(state, a.id, (r) => ({ ...r, status: 'running', steps: r.steps.map((s, k) => (k === a.i ? { ...s, status: 'waiting', error: null, retry: (s.retry ?? 0) + 1 } : k > a.i && s.status === 'skipped' ? { ...s, status: 'waiting' } : s)) }))
    case 'DISMISS': return state.filter((r) => r.id !== a.id)
    default: return state
  }
}

export function ChainsProvider({ children }) {
  const { jobs, submit, cancel } = useJobs()
  const { assets } = useAssets()
  const toast = useToast()
  const [runs, dispatch] = useReducer(reducer, [])
  const [saved, setSaved] = useState(readSaved)
  const started = useRef(new Set())
  const announced = useRef(new Set())
  const seq = useRef(0)

  useEffect(() => { try { localStorage.setItem(SAVED, JSON.stringify(saved)) } catch { /* ignoré */ } }, [saved])

  const startStep = useCallback((run, i) => {
    const key = `${run.id}:${i}:${run.steps[i].retry ?? 0}`
    if (started.current.has(key)) return
    started.current.add(key)
    const st = run.steps[i]
    const e = entryById(st.entryId)
    const inputAssetId = i === 0 ? run.inputAssetId : run.steps[i - 1].assetId
    const r = submit({
      kind: e.kind,
      title: e.model.name,
      prompt: st.prompt,
      cost: st.cost,
      secs: stepSecs(st),
      count: 1,
      meta: `Étape ${i + 1}/${run.steps.length} · ${run.name}`,
      chain: { runId: run.id, step: i },
      input: inputAssetId ? { assetId: inputAssetId } : null,
    })
    if (r.ok) dispatch({ type: 'STEP_STARTED', id: run.id, i, jobId: r.job.id, jobKey: r.job.key })
    else dispatch({ type: 'STEP_BLOCKED', id: run.id, i, error: `Solde insuffisant : il manque ${jetons(r.missing)} jetons pour cette étape.` })
  }, [submit])

  // Fait avancer chaque chaîne : étape terminée → asset → étape suivante.
  useEffect(() => {
    runs.forEach((run) => {
      if (run.status !== 'running') return
      const i = run.steps.findIndex((s) => s.status !== 'done')
      if (i < 0) {
        dispatch({ type: 'RUN_DONE', id: run.id })
        if (!announced.current.has(run.id)) { announced.current.add(run.id); toast(`Chaîne « ${run.name} » terminée : le résultat est dans la bibliothèque.`) }
        return
      }
      const st = run.steps[i]
      if (st.status === 'waiting') return startStep(run, i)
      const job = jobs.find((j) => j.id === st.jobId)
      if (!job) return
      if (job.status === 'COMPLETED') {
        const asset = assets.find((a) => a.origin?.jobKey === st.jobKey)
        if (asset) dispatch({ type: 'STEP_DONE', id: run.id, i, assetId: asset.id })
      } else if (job.status === 'FAILED') {
        dispatch({ type: 'STEP_FAILED', id: run.id, i, error: 'La génération a échoué. Les jetons de cette étape sont remboursés ; les étapes suivantes ne sont pas facturées.' })
      } else if (job.status === 'CANCELED') {
        dispatch({ type: 'RUN_CANCELED', id: run.id })
      }
    })
  }, [runs, jobs, assets, startStep, toast])

  const startRun = useCallback((draft) => {
    const id = `run-${Date.now().toString(36)}-${++seq.current}`
    const steps = draft.steps.map((s) => ({ ...s, cost: stepCost(s), status: 'waiting', jobId: null, jobKey: null, assetId: null, error: null }))
    dispatch({ type: 'START', run: { id, name: draft.name.trim() || 'Chaîne', status: 'running', inputAssetId: draft.inputAssetId ?? null, steps, createdAt: Date.now() } })
    return id
  }, [])

  const value = useMemo(() => ({
    runs,
    saved,
    startRun,
    cancelRun: (run) => {
      const live = run.steps.find((s) => s.status === 'running')
      if (live) cancel(live.jobId)
      dispatch({ type: 'RUN_CANCELED', id: run.id })
    },
    resume: (run) => {
      const i = run.steps.findIndex((s) => s.status === 'waiting' || s.status === 'failed')
      if (i < 0) return
      dispatch({ type: 'RESUME', id: run.id, i })
    },
    dismiss: (id) => dispatch({ type: 'DISMISS', id }),
    save: (def) => setSaved((xs) => (def.id && xs.some((x) => x.id === def.id) ? xs.map((x) => (x.id === def.id ? def : x)) : [...xs, { ...def, id: def.id ?? `c-${Date.now().toString(36)}` }])),
    unsave: (id) => setSaved((xs) => xs.filter((x) => x.id !== id)),
  }), [runs, saved, startRun, cancel])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
