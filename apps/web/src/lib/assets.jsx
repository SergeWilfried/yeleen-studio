import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useJobs } from './jobs.jsx'
import { ApiError, api, apiEnabled } from './api.js'
import { useAuthState } from './auth.jsx'
import { useToast } from './toasts.jsx'
import { blobDelete, blobGet, blobPut, clipFor, grabFrame, gradientPng, synthWav, vividIndex } from './media.js'

/**
 * Bibliothèque d'assets : tout ce qui a été généré ou importé, retrouvable et réutilisable.
 * - Les générations terminées y entrent automatiquement (une entrée par sortie).
 * - Les fichiers importés sont conservés (métadonnées en localStorage, fichier en IndexedDB).
 * - Avec l'API et une session : « Ma bibliothèque » vit côté serveur (D1 et R2), le navigateur n'en garde qu'une copie à l'écran. Les éléments créés sans
 *   l'API (générations simulées, API éteinte) restent dans le navigateur.
 * - Les générations simulées sont décrites par une graine ; leur média est fabriqué à la demande (voir media.js).
 */
const KEY = 'studio.assets.v1'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* quota ou navigation privée */ } }

const Ctx = createContext(null)
export const useAssets = () => useContext(Ctx)

export const KINDS = { image: 'Image', video: 'Vidéo', audio: 'Audio' }
/** Un asset du serveur → la forme que l'interface connaît (avec son origine : la génération, côté navigateur `jobKey`, d'où il vient). */
const norm = (r, jobKey) => ({ ...r, origin: { jobKey: jobKey ?? (r.jobId ? `server:${r.jobId}` : null), index: r.index ?? 0, runId: null, step: null } })
const MESSAGES = {
  unsupported_type: 'Format non pris en charge : image, vidéo ou audio.',
  too_large: 'Fichier trop lourd (25 Mo au plus pour une image ou un audio, 100 Mo pour une vidéo).',
  quota_exceeded: 'Votre bibliothèque est pleine : supprimez des fichiers pour en ajouter.',
  storage: 'L’enregistrement a échoué : réessayez.',
  unauthorized: 'Connexion expirée : reconnectez-vous.',
}
const uploadMessage = (e) => (e instanceof ApiError ? MESSAGES[e.body?.error] ?? 'L’import a échoué : réessayez.' : 'L’import a échoué : réessayez.')
const kindOfFile = (f) => (f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : null)
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset'
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) // graine stable pour la forme d'onde d'un fichier réel
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4' }
const uid = () => `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Durée d'un fichier audio ou vidéo, lue dans le navigateur. */
const mediaSeconds = (file) => new Promise((resolve) => {
  const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
  const url = URL.createObjectURL(file)
  el.preload = 'metadata'
  el.onloadedmetadata = () => { resolve(Math.round(el.duration * 10) / 10); URL.revokeObjectURL(url) }
  el.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
  el.src = url
})

export function AssetsProvider({ children }) {
  const { jobs } = useJobs()
  const [assets, setAssets] = useState(read)
  const files = useRef(new Map()) // id → File importé, pour la session en cours
  const toast = useToast()
  const { ready, signedIn } = useAuthState()
  const server = apiEnabled && ready && signedIn // « Ma bibliothèque » est côté serveur
  const serverRef = useRef(server)
  serverRef.current = server
  const [remote, setRemote] = useState([]) // Ma bibliothèque côté serveur
  const remoteRef = useRef(remote)
  remoteRef.current = remote
  const [adopted, setAdopted] = useState([]) // éléments de la Bibliothèque Yeleen utilisés comme références : hors « Ma bibliothèque », mais retrouvables par id
  const ingested = useRef(new Set())
  const trash = useRef({ local: [], remote: [] })

  // Enregistrement différé : la liste entière est sérialisée, on ne le fait pas à chaque changement (ni pendant une rafale).
  const latest = useRef(assets)
  latest.current = assets
  useEffect(() => {
    const t = setTimeout(() => write(latest.current), 500)
    return () => clearTimeout(t)
  }, [assets])
  useEffect(() => { // sortie de la page ou onglet masqué : on enregistre tout de suite
    const flush = () => write(latest.current)
    const onHide = () => { if (document.hidden) flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide) }
  }, [])

  // Les générations terminées entrent dans la bibliothèque.
  useEffect(() => {
    const fresh = []
    for (const j of jobs) {
      if (j.status !== 'COMPLETED' || ingested.current.has(j.key)) continue
      ingested.current.add(j.key)
      if (j.kind === 'montage') {
        const m = j.spec.spot.manifest
        fresh.push({
          id: `${j.key}-0`, kind: 'video', source: 'generated', name: `Spot · ${m.title}`, prompt: m.script, model: 'Spot pub', meta: j.meta,
          cost: j.cost, secs: m.duration, seed: m.video.seed, art: m.video.art, spot: m, createdAt: j.finishedAt ?? Date.now(), starred: false,
          origin: { jobKey: j.key, index: 0, runId: j.spec.spot.runId, step: null },
        })
        continue
      }
      if (j.live) {
        if (serverRef.current && j.assets?.length) { // le serveur a déjà classé les sorties dans la bibliothèque : on les affiche
          const rows = j.assets.map((a) => norm(a, j.key))
          setRemote((xs) => [...rows, ...xs.filter((x) => !rows.some((r) => r.id === x.id))])
          continue
        }
        // Générations réelles : un asset par fichier renvoyé, repéré par son adresse (chez fal, temporaire en attendant R2).
        const outs = j.outputs ?? []
        outs.forEach((o, i) => {
          fresh.push({
            id: `${j.key}-${i}`, kind: j.kind, source: 'generated', name: `${j.title}${outs.length > 1 ? ` · ${i + 1}/${outs.length}` : ''}`,
            prompt: j.prompt, model: j.title, meta: j.meta, cost: Math.round((j.cost / outs.length) * 10) / 10, secs: j.spec.secs ?? null,
            seed: hash(o.url), url: o.url, contentType: o.contentType, art: null, createdAt: j.finishedAt ?? Date.now(), starred: false,
            origin: { jobKey: j.key, index: i, runId: null, step: null },
          })
        })
        continue
      }
      const n = j.seeds.length
      j.seeds.forEach((seed, i) => {
        fresh.push({
          id: `${j.key}-${i}`,
          kind: j.kind,
          source: 'generated',
          name: `${j.title}${n > 1 ? ` · ${i + 1}/${n}` : ''}`,
          prompt: j.prompt,
          model: j.title,
          meta: j.meta,
          cost: Math.round((j.cost / n) * 10) / 10,
          secs: j.spec.secs ?? null,
          seed,
          art: j.kind === 'image' ? { palette: 'image', index: seed + i } : j.kind === 'video' ? { palette: 'video', index: vividIndex(j.seeds[0]) } : null,
          createdAt: j.finishedAt ?? Date.now(),
          starred: false,
          origin: { jobKey: j.key, index: i, runId: j.spec.chain?.runId ?? null, step: j.spec.chain?.step ?? null },
        })
      })
    }
    if (fresh.length) setAssets((xs) => [...fresh.reverse(), ...xs.filter((x) => !fresh.some((f) => f.id === x.id))])
  }, [jobs])

  // Chargement de Ma bibliothèque côté serveur (à la connexion), sans écraser ce qui vient d'arriver.
  useEffect(() => {
    if (!server) { setRemote([]); return }
    let alive = true
    api.library({ limit: 200 })
      .then((r) => { if (alive) { const rows = r.assets.map((a) => norm(a)); setRemote((xs) => [...rows, ...xs.filter((x) => !rows.some((n) => n.id === x.id))]) } })
      .catch(() => { /* API ou base indisponible : on garde ce qui est dans le navigateur */ })
    return () => { alive = false }
  }, [server])

  const addUpload = useCallback(async (file) => {
    const kind = kindOfFile(file)
    if (!kind) return null
    if (serverRef.current) {
      try {
        const row = await api.uploadAsset(file, kind === 'image' ? null : await mediaSeconds(file))
        const asset = norm(row)
        files.current.set(asset.id, file) // la session garde le fichier : pas de nouveau téléchargement pour s'en servir
        setRemote((xs) => [asset, ...xs])
        return asset
      } catch (e) {
        if (!(e instanceof ApiError) || (e.status !== 0 && e.status !== 503)) throw new Error(uploadMessage(e))
        // API éteinte ou sans stockage : le fichier reste dans le navigateur
      }
    }
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
    const known = read().find((a) => a.fingerprint === fingerprint)
    if (known) { files.current.set(known.id, file); return known }
    const id = uid()
    files.current.set(id, file)
    blobPut(id, file)
    const asset = { id, kind, source: 'upload', name: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, type: file.type, size: file.size, fingerprint, createdAt: Date.now(), starred: false, secs: null }
    setAssets((xs) => [asset, ...xs])
    if (kind !== 'image') mediaSeconds(file).then((secs) => secs && setAssets((xs) => xs.map((a) => (a.id === id ? { ...a, secs } : a))))
    return asset
  }, [])

  const update = useCallback((id, patch) => {
    if (remoteRef.current.some((a) => a.id === id)) {
      setRemote((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      const undo = (back) => () => { setRemote((xs) => xs.map((a) => (a.id === id ? { ...a, ...back } : a))); toast('Action impossible : réessayez.') }
      const was = remoteRef.current.find((a) => a.id === id)
      if (patch.starred !== undefined) api.setFavorite('mine', id, patch.starred).catch(undo({ starred: was.starred }))
      if (patch.name) api.renameAsset(id, patch.name).catch(undo({ name: was.name }))
      return
    }
    setAssets((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }, [toast])

  const remove = useCallback((ids) => {
    const gone = remoteRef.current.filter((a) => ids.includes(a.id))
    if (gone.length) {
      setRemote((xs) => xs.filter((a) => !ids.includes(a.id)))
      api.deleteAssets(gone.map((a) => a.id)).catch(() => { setRemote((xs) => [...gone, ...xs]); toast('Suppression impossible : réessayez.') })
    }
    setAssets((xs) => {
      trash.current = { local: xs.filter((a) => ids.includes(a.id)), remote: gone }
      return xs.filter((a) => !ids.includes(a.id))
    })
  }, [toast])
  const restore = useCallback(() => {
    const { local, remote: back } = trash.current
    trash.current = { local: [], remote: [] }
    setAssets((xs) => [...xs, ...local].sort((a, b) => b.createdAt - a.createdAt))
    if (back.length) {
      setRemote((xs) => [...back, ...xs].sort((a, b) => b.createdAt - a.createdAt))
      api.restoreAssets(back.map((a) => a.id)).catch(() => toast('Restauration impossible : réessayez.'))
    }
  }, [toast])
  const purge = useCallback((ids) => ids.forEach((id) => { files.current.delete(id); blobDelete(id) }), [])

  /** Le fichier réel d'un asset (ou l'une de ses images clés pour une vidéo), prêt à remplir une entrée. */
  const getFile = useCallback(async (asset, { frame } = {}) => {
    if (asset.source === 'upload' && !asset.url) { // importé dans le navigateur ; un import côté serveur se télécharge par son adresse, plus bas
      let f = files.current.get(asset.id)
      if (!f) {
        const blob = await blobGet(asset.id)
        if (!blob) throw new Error('Fichier introuvable : réimportez-le.')
        f = new File([blob], asset.fileName ?? asset.name, { type: asset.type })
        files.current.set(asset.id, f)
      }
      if (asset.kind === 'video' && frame) {
        const url = URL.createObjectURL(f)
        const png = await grabFrame(url, frame)
        URL.revokeObjectURL(url)
        return new File([png], `${slug(asset.name)}-${frame === 'last' ? 'derniere' : 'premiere'}-image.png`, { type: 'image/png' })
      }
      return f
    }
    const base = slug(asset.name)
    if (asset.url) {
      // Fichier réel : on le télécharge (ou on en extrait une image clé pour une vidéo).
      if (asset.kind === 'video' && frame) return new File([await grabFrame(asset.url, frame)], `${base}-${frame === 'last' ? 'derniere' : 'premiere'}-image.png`, { type: 'image/png' })
      const res = await fetch(asset.url)
      if (!res.ok) throw new Error('Fichier introuvable : il a peut-être expiré.')
      const blob = await res.blob()
      const type = asset.contentType ?? blob.type
      return new File([blob], `${base}.${EXT[type] ?? 'bin'}`, { type })
    }
    if (asset.kind === 'image') return new File([await gradientPng(asset.art.palette, asset.art.index)], `${base}.png`, { type: 'image/png' })
    if (asset.kind === 'audio') return new File([synthWav(asset.seed, asset.secs ?? 5)], `${base}.wav`, { type: 'audio/wav' })
    if (frame) return new File([await grabFrame(clipFor(asset.seed), frame)], `${base}-${frame === 'last' ? 'derniere' : 'premiere'}-image.png`, { type: 'image/png' })
    const blob = await (await fetch(clipFor(asset.seed))).blob()
    return new File([blob], `${base}.mp4`, { type: 'video/mp4' })
  }, [])

  // Tout ce qui s'affiche : Ma bibliothèque côté serveur et ce qui est resté dans le navigateur, les plus récents d'abord.
  const all = useMemo(() => [...remote, ...assets].sort((a, b) => b.createdAt - a.createdAt), [remote, assets])

  /** Retient des éléments de la Bibliothèque Yeleen (session en cours) pour qu'ils se comportent comme n'importe quelle référence jointe. */
  const adopt = useCallback((items) => setAdopted((xs) => [...xs, ...items.filter((i) => !xs.some((x) => x.id === i.id))]), [])
  /** Ma bibliothèque + éléments Yeleen adoptés : de quoi résoudre une pièce jointe par son identifiant. */
  const pool = useMemo(() => [...all, ...adopted], [all, adopted])

  /** Importe plusieurs fichiers ; retourne { added, unsupported, errors } (aucun message : c'est à l'écran appelant de dire quoi afficher). */
  const importMany = useCallback(async (list) => {
    const results = await Promise.all([...list].map((f) => addUpload(f).then((a) => ({ a }), (e) => ({ e: e.message }))))
    return { added: results.map((r) => r.a).filter(Boolean), unsupported: results.filter((r) => !r.e && !r.a).length, errors: [...new Set(results.map((r) => r.e).filter(Boolean))] }
  }, [addUpload])

  const byJob = useCallback((jobKey) => all.filter((a) => a.origin?.jobKey === jobKey).sort((a, b) => a.origin.index - b.origin.index), [all])

  const value = useMemo(() => ({ assets: all, pool, adopt, addUpload, importMany, update, remove, restore, purge, getFile, byJob, files }), [all, pool, adopt, addUpload, importMany, update, remove, restore, purge, getFile, byJob])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
