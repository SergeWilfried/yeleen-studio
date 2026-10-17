import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { dueJobs } from './pollDelay.js'
import { useAuthState } from './auth.jsx'
import { api, apiEnabled } from './api.js'

/**
 * Moteur de générations simulé, calqué sur la file d'un fournisseur (fal : IN_QUEUE → IN_PROGRESS → COMPLETED).
 * Remplacez `make` / le minuteur par de vrais appels (soumission, abonnement à la file, webhooks) :
 * les états, le solde et les remboursements restent les mêmes pour l'interface.
 *
 * Mode réel : une génération qui porte `spec.live` (modèle et options) part vers l'API (apps/api), qui appelle fal ;
 * le suivi se fait par interrogation et le solde vient du serveur. Sans `VITE_API_URL`, tout reste simulé.
 *
 * Pour tester les échecs (moteur simulé) : un prompt contenant « [echec] » échoue côté fournisseur ; « interdit », « violence »,
 * « nsfw » ou « sang » est refusé par la modération. Le reste échoue au hasard (8 %, 15 % en vidéo).
 */
export const MAX_PARALLEL = 2
const START_BALANCE = 240
const BASE_MS = { image: 6000, video: 18000, audio: 5000, montage: 3000 }
const LIVE_MS = { image: 16000, video: 90000, audio: 8000 } // durée typique chez le fournisseur : sert à estimer la progression, fal n'en donne pas

export const jetons = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
// En français, « 1 jeton » mais « 2 jetons » (le singulier couvre aussi 1,5).
export const jetonLabel = (n) => `${jetons(n)} jeton${n >= 2 ? 's' : ''}`

const STEPS = {
  image: [[10, 'Chargement du modèle'], [35, 'Génération'], [80, 'Mise à l’échelle et contrôle qualité'], [95, 'Enregistrement du résultat']],
  video: [[8, 'Chargement du modèle'], [25, 'Génération des images clés'], [60, 'Interpolation du mouvement'], [85, 'Encodage vidéo'], [96, 'Enregistrement du résultat']],
  audio: [[15, 'Synthèse vocale'], [70, 'Normalisation du volume'], [95, 'Enregistrement du résultat']],
  montage: [[20, 'Assemblage de la vidéo'], [50, 'Mixage de la voix'], [75, 'Incrustation des sous-titres'], [92, 'Carte finale et export']],
}

export const FAILURES = {
  moderation: {
    message: 'Contenu refusé par le filtre de sécurité',
    hint: 'Reformulez votre description : évitez les scènes violentes ou explicites. Aucun jeton n’a été débité.',
    retry: false,
  },
  insufficient: {
    message: 'Solde insuffisant',
    hint: 'Il ne reste pas assez de jetons pour cette génération. Rechargez puis relancez : rien n’a été débité.',
    retry: true,
  },
  unreachable: {
    message: 'Le service de génération est injoignable',
    hint: 'Vos jetons n’ont pas été débités. Vérifiez que l’API tourne, puis relancez.',
    retry: true,
  },
  auth: {
    message: 'Connexion expirée',
    hint: 'Reconnectez-vous, puis relancez. Rien n’a été débité.',
    retry: true,
  },
  busy: {
    message: 'Trop de générations en cours',
    hint: 'Attendez qu’une génération se termine, puis relancez. Rien n’a été débité.',
    retry: true,
  },
  too_expensive: {
    message: 'Génération trop coûteuse',
    hint: 'Cette demande dépasse la limite d’une génération. Réduisez la durée ou la résolution, puis relancez : rien n’a été débité.',
    retry: false,
  },
  rejected: {
    message: 'La demande a été refusée par le service',
    hint: 'Vérifiez le modèle et les options choisis, puis relancez. Aucun jeton n’a été débité.',
    retry: false,
  },
  provider: {
    message: 'Le fournisseur n’a pas répondu à temps',
    hint: 'Ce n’est pas lié à votre demande. Vos jetons ont été remboursés : vous pouvez relancer.',
    retry: true,
  },
}

function tick(state, now) {
  let balance = state.balance
  const notes = []

  let jobs = state.jobs.map((j) => {
    if (j.live) return j.status === 'IN_PROGRESS' ? { ...j, progress: Math.min(92, ((now - j.startedAt) / j.duration) * 100) } : j // estimation : fal ne donne pas de pourcentage
    if (j.status !== 'IN_PROGRESS') return j
    const progress = Math.min(100, ((now - j.startedAt) / j.duration) * 100)
    const fresh = j.steps.filter(([p, msg]) => p <= progress && !j.logs.some((l) => l.msg === msg)).map(([, msg]) => ({ msg }))
    const logs = fresh.length ? j.logs.concat(fresh) : j.logs
    if (j.failure && progress >= j.failAt) {
      balance += j.cost
      notes.push(`Échec : ${j.title}. ${jetons(j.cost)} jetons remboursés.`)
      return { ...j, status: 'FAILED', progress: j.failAt, finishedAt: now, refund: j.cost, logs: logs.concat({ msg: `Erreur : ${FAILURES[j.failure].message}`, error: true }) }
    }
    if (progress >= 100) {
      notes.push(`Terminée : ${j.title}.`)
      return { ...j, status: 'COMPLETED', progress: 100, finishedAt: now, logs: logs.concat({ msg: 'Terminé' }) }
    }
    return { ...j, progress, logs }
  })

  let running = jobs.filter((j) => !j.live && j.status === 'IN_PROGRESS').length
  jobs = jobs.map((j) => {
    if (j.live || j.status !== 'IN_QUEUE' || running >= MAX_PARALLEL) return j
    running++
    return { ...j, status: 'IN_PROGRESS', startedAt: now, progress: 0, queuePosition: 0, logs: j.logs.concat({ msg: 'Démarrage du worker' }) }
  })

  // Position et attente estimée de chaque job en file : chacun prend le premier créneau libre.
  const slots = jobs.filter((j) => !j.live && j.status === 'IN_PROGRESS').map((j) => Math.max(0, j.startedAt + j.duration - now))
  while (slots.length < MAX_PARALLEL) slots.push(0)
  let position = 0
  jobs = jobs.map((j) => {
    if (j.live || j.status !== 'IN_QUEUE') return j
    position++
    slots.sort((a, b) => a - b)
    const eta = slots[0]
    slots[0] += j.duration
    return { ...j, queuePosition: position, eta }
  })

  return { ...state, jobs, balance, message: notes.length ? notes.join(' ') : state.message }
}

function reducer(state, action) {
  switch (action.type) {
    case 'TICK':
      return tick(state, action.now)
    case 'SUBMIT':
      return tick({ ...state, balance: action.job.live ? state.balance : state.balance - action.job.cost, jobs: [...state.jobs, action.job], message: `${action.job.title} : en file d’attente.` }, action.now)
    case 'RETRY': {
      const jobs = state.jobs.filter((j) => j.id !== action.replaces).concat(action.job)
      return tick({ ...state, balance: action.job.live ? state.balance : state.balance - action.job.cost, jobs, message: `${action.job.title} : nouvelle tentative.` }, action.now)
    }
    case 'CANCEL': {
      const j = state.jobs.find((x) => x.id === action.id)
      if (!j || (j.status !== 'IN_QUEUE' && j.status !== 'IN_PROGRESS')) return state
      if (j.live) {
        // Réel : annulée en file = remboursée en entier ; déjà en cours chez le fournisseur = facturée. Le solde exact vient du serveur.
        const refund = j.status === 'IN_QUEUE' ? j.cost : 0
        const jobs = state.jobs.map((x) => (x.id === j.id ? { ...x, status: 'CANCELED', finishedAt: action.now, refund, logs: x.logs.concat({ msg: 'Annulé par l’utilisateur' }) } : x))
        return { ...state, jobs, message: refund ? `${j.title} annulée. ${jetons(refund)} jetons remboursés.` : `${j.title} annulée. La génération avait déjà commencé : elle est facturée.` }
      }
      // En file : tout est remboursé. En cours : seule la part non consommée l'est.
      const refund = j.status === 'IN_QUEUE' ? j.cost : Math.round(j.cost * (1 - j.progress / 100) * 10) / 10
      const jobs = state.jobs.map((x) => (x.id === j.id ? { ...x, status: 'CANCELED', finishedAt: action.now, refund, logs: x.logs.concat({ msg: 'Annulé par l’utilisateur' }) } : x))
      return tick({ ...state, jobs, balance: state.balance + refund, message: `${j.title} annulée. ${jetons(refund)} jetons remboursés.` }, action.now)
    }
    case 'SYNC_WALLET':
      return { ...state, balance: action.balance, serverBalance: action.balance }
    case 'REMOTE': {
      // Résultat d'un appel à l'API : on met la génération à jour, et le solde du serveur n'ajoute que sa variation
      // (les dépenses du moteur simulé, que le serveur ignore, restent comptées).
      let { balance, serverBalance } = state
      if (action.balance != null) {
        if (serverBalance != null) balance += action.balance - serverBalance
        serverBalance = action.balance
      }
      const jobs = state.jobs.map((j) => (j.id === action.id ? { ...j, ...action.patch, logs: action.patch.logs ? j.logs.concat(action.patch.logs) : j.logs } : j))
      return { ...state, jobs, balance, serverBalance, message: action.message ?? state.message }
    }
    case 'DISMISS':
      return { ...state, jobs: state.jobs.filter((j) => j.id !== action.id) }
    case 'CLEAR_DONE':
      return { ...state, jobs: state.jobs.filter((j) => (action.kind ? j.kind !== action.kind : false) || j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS') }
    default:
      return state
  }
}

const Ctx = createContext(null)
export const useJobs = () => useContext(Ctx)

export function JobsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { jobs: [], balance: START_BALANCE, serverBalance: null, message: '' })
  const ref = useRef(state)
  ref.current = state
  const seq = useRef(0)

  const active = state.jobs.some((j) => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 250)
    return () => clearInterval(id)
  }, [active])

  const make = useCallback((spec, attempt = 1) => {
    const kind = spec.kind
    const count = spec.count ?? 1
    const moderated = /interdit|violence|nsfw|sang/i.test(spec.prompt)
    const live = Boolean(spec.live && apiEnabled)
    const failure = live ? null : moderated ? 'moderation' : /\[echec\]/i.test(spec.prompt) || Math.random() < (kind === 'video' ? 0.15 : 0.08) ? 'provider' : null
    const id = `job-${++seq.current}`
    const createdAt = Date.now()
    return {
      id,
      key: `${createdAt}-${id}`, // identifiant stable entre sessions : sert d'origine aux assets créés
      kind,
      title: spec.title,
      prompt: spec.prompt,
      meta: spec.meta,
      count,
      cost: spec.cost,
      spec,
      attempt,
      status: 'IN_QUEUE',
      createdAt,
      startedAt: null,
      finishedAt: null,
      progress: 0,
      queuePosition: 0,
      eta: 0,
      live,
      remoteId: null,
      duration: live ? LIVE_MS[kind] : BASE_MS[kind] * (0.8 + Math.random() * 0.4),
      failure,
      failAt: moderated ? 4 : 35 + Math.random() * 45,
      steps: STEPS[kind],
      logs: [{ msg: live ? 'Envoyé au service de génération' : 'Requête reçue, en file d’attente' }],
      refund: 0,
      seeds: Array.from({ length: count }, () => Math.floor(Math.random() * 1000)),
    }
  }, [])

  // Échec d'un appel à l'API (avant ou pendant l'envoi à fal) : la génération échoue, avec le remboursement que le serveur confirme.
  const failLive = useCallback((id, err) => {
    const code = err.body?.error
    const failure = code === 'moderation' ? 'moderation' : code === 'insufficient' ? 'insufficient' : code === 'too_expensive' ? 'too_expensive' : code === 'too_many_active' ? 'busy' : err.status === 401 || code === 'unauthorized' ? 'auth' : err.status === 0 ? 'unreachable' : err.status === 400 ? 'rejected' : 'provider'
    const job = ref.current.jobs.find((j) => j.id === id)
    dispatch({
      type: 'REMOTE', id, balance: err.body?.balance,
      patch: { status: 'FAILED', failure, refund: err.body?.refunded ?? 0, finishedAt: Date.now(), logs: [{ msg: `Erreur : ${FAILURES[failure].message}`, error: true }] },
      message: `Échec : ${job?.title ?? 'génération'}.`,
    })
  }, [])

  // Envoi réel : les fichiers d'entrée (images, audio) sont d'abord déposés chez le fournisseur, puis la demande part.
  const startLive = useCallback(async (job, live) => {
    const { files, elements, references, inputFiles, ...body } = live
    const given = Object.entries(files ?? {}).filter(([, f]) => f)
    const total = given.length + (elements?.length ?? 0) + (references?.length ?? 0)
    if (total) {
      dispatch({ type: 'REMOTE', id: job.id, patch: { logs: [{ msg: total > 1 ? 'Envoi des fichiers' : 'Envoi du fichier' }] } })
      const [urls, elUrls, refUrls] = await Promise.all([Promise.all(given.map(([, f]) => api.upload(f))), Promise.all((elements ?? []).map((e) => api.upload(e.file))), Promise.all((references ?? []).map((r) => api.upload(r.file)))])
      const field = { start: 'startImageUrl', end: 'endImageUrl', audio: 'audioUrl', model: 'modelImageUrl', garment: 'garmentImageUrl' }
      given.forEach(([slot], i) => { body[field[slot]] = urls[i] })
      if (elements?.length) body.elements = elements.map((e, i) => ({ kind: e.kind, url: elUrls[i] }))
      if (references?.length) body.references = references.map((r, i) => ({ kind: r.kind, url: refUrls[i] }))
    }
    if (inputFiles) { // workflow : chaque champ photo (un fichier, ou une liste) est déposé chez le fournisseur
      const up = async (v) => (Array.isArray(v) ? Promise.all(v.map((f) => api.upload(f))) : api.upload(v))
      const entries = await Promise.all(Object.entries(inputFiles).map(async ([k, v]) => [k, await up(v)]))
      body.inputs = { ...body.inputs, ...Object.fromEntries(entries) }
    }
    body.requestId = job.key // même clé = même génération côté serveur : un nouvel essai ne débite pas deux fois
    try {
      return await api.createJob(body)
    } catch (e) {
      if (e.status !== 0 && e.status < 500) throw e // refus clair (solde, modération…) : inutile de réessayer
      await new Promise((r) => setTimeout(r, 1000)) // coupure réseau ou erreur passagère : un seul nouvel essai, sans risque grâce à la clé
      return api.createJob(body)
    }
  }, [])

  const submit = useCallback((spec, replaces) => {
    const missing = spec.cost - ref.current.balance
    if (missing > 0) return { ok: false, missing }
    const attempt = replaces ? (ref.current.jobs.find((j) => j.id === replaces)?.attempt ?? 1) + 1 : 1
    const job = make(spec, attempt)
    dispatch(replaces ? { type: 'RETRY', replaces, job, now: Date.now() } : { type: 'SUBMIT', job, now: Date.now() })
    if (job.live) {
      startLive(job, spec.live)
        .then((r) => {
          dispatch({ type: 'REMOTE', id: job.id, balance: r.balance, patch: { remoteId: r.jobId, logs: [{ msg: 'Demande acceptée' }] } })
          // Annulée pendant l'envoi : on prévient le serveur dès qu'il a un identifiant.
          if (ref.current.jobs.find((j) => j.id === job.id)?.status === 'CANCELED') {
            api.cancelJob(r.jobId).then((c) => dispatch({ type: 'REMOTE', id: job.id, balance: c.balance, patch: { refund: c.refund } })).catch(() => {})
          }
        })
        .catch((e) => failLive(job.id, e))
    }
    return { ok: true, job }
  }, [make, failLive, startLive])

  // Solde réel au démarrage (et à la connexion : sans session, l'API refuse).
  const { ready, signedIn } = useAuthState()
  useEffect(() => {
    if (!apiEnabled || !ready || !signedIn) return
    api.wallet().then((w) => dispatch({ type: 'SYNC_WALLET', balance: w.balance })).catch(() => { /* API éteinte : le solde simulé reste affiché */ })
  }, [ready, signedIn])

  // Suivi des générations réelles : on interroge l'API tant qu'une génération est active.
  const polling = useRef(new Set())
  const last = useRef(new Map()) // dernier appel par génération : le rythme dépend de son âge et de la visibilité de l'onglet
  const liveActive = state.jobs.some((j) => j.live && j.remoteId && (j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS'))
  useEffect(() => {
    if (!liveActive) return
    const isActive = (j) => j && (j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')
    const poll = () => dueJobs(ref.current.jobs.filter((j) => j.live && j.remoteId && isActive(j)), last.current, Date.now(), document.hidden).forEach(async (j) => {
      if (polling.current.has(j.id)) return
      polling.current.add(j.id)
      last.current.set(j.id, Date.now())
      try {
        const r = await api.job(j.remoteId)
        if (!isActive(ref.current.jobs.find((x) => x.id === j.id))) return // annulée entre-temps : on ne la relance pas
        const now = Date.now()
        const logs = (r.logs ?? []).filter((m) => !j.logs.some((l) => l.msg === m)).map((msg) => ({ msg }))
        let patch
        let message
        if (r.status === 'COMPLETED') { patch = { status: 'COMPLETED', progress: 100, finishedAt: now, outputs: r.outputs, logs: logs.concat({ msg: 'Terminé' }) }; message = `Terminée : ${j.title}.` }
        else if (r.status === 'FAILED') { const failure = r.failure ?? 'provider'; patch = { status: 'FAILED', failure, refund: r.refund ?? 0, finishedAt: now, logs: logs.concat({ msg: `Erreur : ${FAILURES[failure].message}`, error: true }) }; message = `Échec : ${j.title}. ${jetons(r.refund ?? 0)} jetons remboursés.` }
        else if (r.status === 'IN_PROGRESS') patch = { status: 'IN_PROGRESS', startedAt: j.startedAt ?? now, queuePosition: 0, logs: logs.length || j.logs.some((l) => l.msg === 'Génération en cours') ? logs : [{ msg: 'Génération en cours' }] } // fal ne détaille pas toujours ses étapes
        else patch = { status: 'IN_QUEUE', queuePosition: r.queuePosition ?? 0, logs }
        dispatch({ type: 'REMOTE', id: j.id, balance: r.balance, patch, message })
      } catch { /* erreur passagère : on réessaie au prochain tour */ } finally { polling.current.delete(j.id) }
    })
    poll()
    const id = setInterval(poll, 1000) // simple vérification locale : seules les générations dont le délai est écoulé appellent l'API
    const wake = () => { if (!document.hidden) { last.current.clear(); poll() } } // retour sur l'onglet : on se met à jour tout de suite
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', wake) }
  }, [liveActive])

  const cancel = useCallback((id) => {
    const j = ref.current.jobs.find((x) => x.id === id)
    dispatch({ type: 'CANCEL', id, now: Date.now() })
    if (j?.live && j.remoteId) api.cancelJob(j.remoteId).then((r) => dispatch({ type: 'REMOTE', id, balance: r.balance, patch: { refund: r.refund } })).catch(() => {})
  }, [])

  const value = useMemo(() => ({
    jobs: state.jobs,
    balance: state.balance,
    running: state.jobs.filter((j) => j.status === 'IN_PROGRESS').length,
    queued: state.jobs.filter((j) => j.status === 'IN_QUEUE').length,
    submit,
    retry: (job) => submit(job.spec, job.id),
    rerun: (job) => submit(job.spec),
    cancel,
    dismiss: (id) => dispatch({ type: 'DISMISS', id }),
    clearDone: (kind) => dispatch({ type: 'CLEAR_DONE', kind }),
  }), [state.jobs, state.balance, submit, cancel])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite">{state.message}</div>
    </Ctx.Provider>
  )
}
