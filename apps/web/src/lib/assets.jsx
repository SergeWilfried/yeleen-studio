import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiEnabled } from './api.js'
import { useAuthState } from './auth.jsx'
import { useJobs } from './jobs.jsx'
import { favoriteSets, hash, mergeRemote, remoteAssetId } from './librarySync.js'
import { blobDelete, blobGet, blobPut, clipFor, grabFrame, gradientPng, synthWav, vividIndex } from './media.js'

/**
 * Bibliothèque d'assets : tout ce qui a été généré ou importé, retrouvable et réutilisable.
 * - Les générations terminées y entrent automatiquement (une entrée par sortie).
 * - Les fichiers importés sont conservés (métadonnées en localStorage, fichier en IndexedDB).
 * - Les générations simulées sont décrites par une graine ; leur média est fabriqué à la demande (voir media.js).
 * - Avec l'API (mode réel, compte connecté), Ma bibliothèque vient aussi du serveur (GET /assets) : les fichiers générés gardés dans R2
 *   se retrouvent sur tout appareil, les favoris et les suppressions sont enregistrés côté serveur (voir librarySync.js).
 */
const KEY = 'studio.assets.v1'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* quota ou navigation privée */ } }

const Ctx = createContext(null)
export const useAssets = () => useContext(Ctx)

export const KINDS = { image: 'Image', video: 'Vidéo', audio: 'Audio' }
const kindOfFile = (f) => (f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : null)
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset'
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

const REMOTE_PAGE = 200

export function AssetsProvider({ children }) {
  const { jobs } = useJobs()
  const { ready, signedIn } = useAuthState()
  const remote = apiEnabled && ready && signedIn
  const [assets, setAssets] = useState(read)
  const files = useRef(new Map()) // id → File importé, pour la session en cours
  const [adopted, setAdopted] = useState([]) // éléments de la Bibliothèque Yeleen utilisés comme références : hors « Ma bibliothèque », mais retrouvables par id
  const ingested = useRef(new Set())
  const trash = useRef([])

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
        // Générations réelles : un asset par fichier renvoyé, repéré par son adresse (chez fal, temporaire en attendant R2).
        const outs = j.outputs ?? []
        outs.forEach((o, i) => {
          fresh.push({
            id: `${j.key}-${i}`, kind: j.kind, source: 'generated', name: `${j.title}${outs.length > 1 ? ` · ${i + 1}/${outs.length}` : ''}`,
            prompt: j.prompt, model: j.title, meta: j.meta, cost: Math.round((j.cost / outs.length) * 10) / 10, secs: j.spec.secs ?? null,
            seed: hash(o.url), url: o.url, contentType: o.contentType, art: null, createdAt: j.finishedAt ?? Date.now(), starred: false,
            remoteId: remoteAssetId(j.remoteId, i, o), origin: { jobKey: j.key, index: i, runId: null, step: null },
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

  // Ma bibliothèque côté serveur : chargée à la connexion et à chaque retour sur l'onglet, fusionnée avec la liste locale.
  useEffect(() => {
    if (!remote) return
    let alive = true
    const sync = async () => {
      try {
        const [{ assets: list }, { favorites }] = await Promise.all([api.assets({ limit: REMOTE_PAGE }), api.favorites()])
        if (!alive) return
        const favs = favoriteSets(favorites).mine
        const opts = { complete: list.length < REMOTE_PAGE }
        setAssets((xs) => mergeRemote(xs, list, favs, opts).list)
        for (const id of mergeRemote(latest.current, list, favs, opts).push) api.setFavorite('mine', id, true).catch(() => {}) // étoiles posées avant la connexion
      } catch { /* API ou base indisponible : la liste locale reste */ }
    }
    sync()
    const onShow = () => { if (!document.hidden) sync() }
    document.addEventListener('visibilitychange', onShow)
    return () => { alive = false; document.removeEventListener('visibilitychange', onShow) }
  }, [remote])

  const addUpload = useCallback(async (file) => {
    const kind = kindOfFile(file)
    if (!kind) return null
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
    const a = latest.current.find((x) => x.id === id)
    if (remote && a?.remoteId && 'starred' in patch && patch.starred !== a.starred) api.setFavorite('mine', a.remoteId, patch.starred).catch(() => {})
    setAssets((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }, [remote])

  const doomed = useRef(new Map()) // id → remoteId des fichiers retirés, supprimés côté serveur seulement au `purge` (après le délai d'annulation)
  const remove = useCallback((ids) => {
    setAssets((xs) => {
      trash.current = xs.filter((a) => ids.includes(a.id))
      for (const a of trash.current) if (a.remoteId) doomed.current.set(a.id, a.remoteId)
      return xs.filter((a) => !ids.includes(a.id))
    })
  }, [])
  const restore = useCallback(() => {
    const back = trash.current
    trash.current = []
    for (const a of back) doomed.current.delete(a.id)
    setAssets((xs) => [...xs, ...back].sort((a, b) => b.createdAt - a.createdAt))
  }, [])
  const purge = useCallback((ids) => ids.forEach((id) => {
    files.current.delete(id)
    blobDelete(id)
    const remoteId = doomed.current.get(id)
    doomed.current.delete(id)
    if (remote && remoteId) api.deleteAsset(remoteId).catch(() => {}) // déjà supprimé ailleurs (404) : rien à faire
  }), [remote])

  /** Le fichier réel d'un asset (ou l'une de ses images clés pour une vidéo), prêt à remplir une entrée. */
  const getFile = useCallback(async (asset, { frame } = {}) => {
    if (asset.source === 'upload') {
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

  /** Retient des éléments de la Bibliothèque Yeleen (session en cours) pour qu'ils se comportent comme n'importe quelle référence jointe. */
  const adopt = useCallback((items) => setAdopted((xs) => [...xs, ...items.filter((i) => !xs.some((x) => x.id === i.id))]), [])
  /** Ma bibliothèque + éléments Yeleen adoptés : de quoi résoudre une pièce jointe par son identifiant. */
  const pool = useMemo(() => [...assets, ...adopted], [assets, adopted])

  const byJob = useCallback((jobKey) => assets.filter((a) => a.origin?.jobKey === jobKey).sort((a, b) => a.origin.index - b.origin.index), [assets])

  const value = useMemo(() => ({ assets, pool, adopt, addUpload, update, remove, restore, purge, getFile, byJob, files }), [assets, pool, adopt, addUpload, update, remove, restore, purge, getFile, byJob])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
