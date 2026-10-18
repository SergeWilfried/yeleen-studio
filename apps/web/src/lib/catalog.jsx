import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiEnabled } from './api.js'
import { useAuthState } from './auth.jsx'
import { features } from './features.js'

/**
 * Bibliothèque Yeleen : personnages, objets (images, rendus 3D sur fond transparent) et vidéos proposés à tous les utilisateurs,
 * à utiliser comme références. Le catalogue est une liste (`public/catalog/yeleen.json`, ou `VITE_CATALOG_URL` : un bucket R2 derrière
 * le CDN) : pas de serveur à interroger. Avec l'API et une session, le catalogue vient de D1 (table catalog_items : modifiable sans déploiement)
 * et les favoris sont enregistrés côté serveur ; sinon, fichier et navigateur. Chaque entrée devient un « asset » (source `yeleen`).
 */
const URL_ = import.meta.env?.VITE_CATALOG_URL || '/catalog/yeleen.json'
const FAVS = 'studio.catalog.favs.v1'
const readFavs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAVS) || '[]')) } catch { return new Set() } }

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
  const { ready, signedIn } = useAuthState()
  const server = apiEnabled && ready && signedIn
  const [state, setState] = useState({ items: [], status: 'loading' })
  const [favs, setFavs] = useState(readFavs)
  const [tick, setTick] = useState(0)
  const serverRef = useRef(server)
  serverRef.current = server

  useEffect(() => {
    if (!features.catalog) return // éteint : on ne télécharge pas le catalogue
    let alive = true
    setState((s) => ({ ...s, status: 'loading' }))
    const load = server ? api.catalog() : fetch(URL_).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    load
      .then((doc) => alive && setState({ status: 'ready', items: (doc.items ?? []).filter((e) => e?.id && e?.name && (e.url || e.art)).map(toAsset) }))
      .catch(() => alive && setState({ items: [], status: 'error' }))
    if (server) api.favorites('yeleen').then((r) => alive && setFavs(new Set(r.ids.map((id) => `yeleen:${id}`)))).catch(() => {})
    return () => { alive = false }
  }, [tick, server])

  const favsRef = useRef(favs)
  favsRef.current = favs
  const toggleFav = useCallback((id) => {
    const on = !favsRef.current.has(id)
    const set = (f, value) => { const n = new Set(f); value ? n.add(id) : n.delete(id); return n }
    setFavs((f) => set(f, on))
    if (serverRef.current) {
      api.setFavorite('yeleen', id.replace(/^yeleen:/, ''), on).catch(() => setFavs((f) => set(f, !on))) // échec : on revient en arrière
    } else {
      try { localStorage.setItem(FAVS, JSON.stringify([...set(favsRef.current, on)])) } catch { /* quota ou navigation privée */ }
    }
  }, [])
  const reload = useCallback(() => setTick((t) => t + 1), [])

  const value = useMemo(() => ({ ...state, favs, toggleFav, reload }), [state, favs, toggleFav, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
