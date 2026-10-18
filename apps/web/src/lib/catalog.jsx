import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiEnabled } from './api.js'
import { useAuthState } from './auth.jsx'
import { features } from './features.js'
import { favoriteSets } from './librarySync.js'

/**
 * Bibliothèque Yeleen : personnages, objets (images, rendus 3D sur fond transparent) et vidéos proposés à tous les utilisateurs,
 * à utiliser comme références. Le catalogue est une liste (`public/catalog/yeleen.json`, ou `VITE_CATALOG_URL` : un bucket R2 derrière
 * le CDN, ou `<API>/catalog`, servi depuis D1) : pas de serveur à interroger. Chaque entrée devient un « asset » (source `yeleen`).
 * Les favoris sont gardés dans le navigateur et, avec l'API (compte connecté), côté serveur (portée `yeleen`) pour suivre l'utilisateur.
 */
const URL_ = import.meta.env?.VITE_CATALOG_URL || '/catalog/yeleen.json'
const FAVS = 'studio.catalog.favs.v1'
const readFavs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAVS) || '[]')) } catch { return new Set() } }
const writeFavs = (set) => { try { localStorage.setItem(FAVS, JSON.stringify([...set])) } catch { /* quota ou navigation privée */ } }
const PREFIX = 'yeleen:'
const entryId = (assetId) => (assetId.startsWith(PREFIX) ? assetId.slice(PREFIX.length) : assetId) // côté serveur : l'identifiant du catalogue

export const CATEGORIES = [
  { id: 'character', label: 'Personnages' },
  { id: 'object', label: 'Objets' },
  { id: 'video', label: 'Vidéos' },
]

/** Une entrée du fichier → un asset utilisable partout comme les autres (références, @, aperçus). */
export function toAsset(entry) {
  return {
    id: `yeleen:${entry.id}`, kind: entry.kind === 'video' ? 'video' : 'image', source: 'yeleen', category: entry.category,
    name: entry.name, url: entry.url ?? null, secs: entry.secs ?? null, art: entry.art ?? null, seed: entry.seed ?? 0,
    placeholder: Boolean(entry.placeholder), createdAt: 0, starred: false,
  }
}

const Ctx = createContext({ items: [], status: 'idle', favs: new Set(), toggleFav: () => {}, reload: () => {} })
export const useCatalog = () => useContext(Ctx)

export function CatalogProvider({ children }) {
  const [state, setState] = useState({ items: [], status: 'loading' })
  const [favs, setFavs] = useState(readFavs)
  const [tick, setTick] = useState(0)
  const { ready, signedIn } = useAuthState()
  const remote = apiEnabled && ready && signedIn
  const favsRef = useRef(favs)
  favsRef.current = favs

  // Favoris du serveur : réunis avec ceux du navigateur ; ceux que le serveur ignore encore lui sont envoyés une fois.
  useEffect(() => {
    if (!remote) return
    let alive = true
    api.favorites().then(({ favorites }) => {
      if (!alive) return
      const server = new Set([...favoriteSets(favorites).yeleen].map((id) => `${PREFIX}${id}`))
      const local = favsRef.current
      for (const id of local) if (!server.has(id)) api.setFavorite('yeleen', entryId(id), true).catch(() => {})
      const all = new Set([...local, ...server])
      writeFavs(all)
      setFavs(all)
    }).catch(() => { /* API ou base indisponible : les favoris du navigateur restent */ })
    return () => { alive = false }
  }, [remote])

  useEffect(() => {
    if (!features.catalog) return // éteint : on ne télécharge pas le catalogue
    let alive = true
    setState((s) => ({ ...s, status: 'loading' }))
    fetch(URL_)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc) => alive && setState({ status: 'ready', items: (doc.items ?? []).filter((e) => e?.id && e?.name && (e.url || e.art)).map(toAsset) }))
      .catch(() => alive && setState({ items: [], status: 'error' }))
    return () => { alive = false }
  }, [tick])

  const toggleFav = useCallback((id) => {
    const n = new Set(favsRef.current)
    const on = !n.has(id)
    on ? n.add(id) : n.delete(id)
    favsRef.current = n
    writeFavs(n)
    setFavs(n)
    if (remote) api.setFavorite('yeleen', entryId(id), on).catch(() => {})
  }, [remote])
  const reload = useCallback(() => setTick((t) => t + 1), [])

  const value = useMemo(() => ({ ...state, favs, toggleFav, reload }), [state, favs, toggleFav, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
