import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from 'react'

/**
 * La bibliothèque est une fenêtre, pas une page : partout dans l'application (barre latérale de Cinéma, en-tête, « Voir dans la
 * bibliothèque », Spot, Marque), `openLibrary(view)` ouvre la même fenêtre que le choix des références de Cinéma, en consultation.
 * `view` : { tab: 'library' | 'yeleen' | 'favs', sub, origin: 'upload' | 'generated', focus: identifiant d'un fichier }.
 */
const AssetModal = lazy(() => import('../components/cinema/AssetModal.jsx'))

const Ctx = createContext({ openLibrary: () => {} })
export const useLibrary = () => useContext(Ctx)

export function LibraryDialogProvider({ children }) {
  const [view, setView] = useState(null)
  const [loaded, setLoaded] = useState(false) // le code de la fenêtre n'est chargé qu'à la première ouverture
  const openLibrary = useCallback((v = {}) => { setLoaded(true); setView({ tab: 'library', ...v }) }, [])
  const close = useCallback(() => setView(null), [])
  const value = useMemo(() => ({ openLibrary }), [openLibrary])
  return (
    <Ctx.Provider value={value}>
      {children}
      {loaded && <Suspense fallback={null}><AssetModal open={Boolean(view)} view={view} onClose={close} /></Suspense>}
    </Ctx.Provider>
  )
}
