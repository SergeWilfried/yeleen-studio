import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { features } from './features.js'

/**
 * Bibliothèque Yeleen : personnages, objets (images, rendus 3D sur fond transparent) et vidéos proposés à tous les utilisateurs,
 * à utiliser comme références. Le catalogue est une liste (`public/catalog/yeleen.json`, ou `VITE_CATALOG_URL` : un bucket R2 derrière
 * le CDN) : pas de serveur à interroger. Chaque entrée devient un « asset » (source `yeleen`) ; les favoris sont gardés dans le navigateur.
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
  const [state, setState] = useState({ items: [], status: 'loading' })
  const [favs, setFavs] = useState(readFavs)
  const [tick, setTick] = useState(0)

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

  const toggleFav = useCallback((id) => setFavs((f) => {
    const n = new Set(f)
    n.has(id) ? n.delete(id) : n.add(id)
    try { localStorage.setItem(FAVS, JSON.stringify([...n])) } catch { /* quota ou navigation privée */ }
    return n
  }), [])
  const reload = useCallback(() => setTick((t) => t + 1), [])

  const value = useMemo(() => ({ ...state, favs, toggleFav, reload }), [state, favs, toggleFav, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
