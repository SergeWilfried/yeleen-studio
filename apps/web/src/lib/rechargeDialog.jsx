import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'

/**
 * La recharge est une fenêtre, pas une page : le solde, « Recharger » (en-tête, barre latérale de Cinéma), « solde insuffisant »
 * et les packs de l'accueil appellent `openRecharge({ pack })`. Le code de la fenêtre n'est chargé qu'à la première ouverture,
 * puis il reste monté : fermer la fenêtre pendant un paiement n'arrête pas son suivi.
 * `request` : { pack, ref } ; `ref` reprend le suivi d'une recharge (retour de Wave).
 */
const RechargeDialog = lazy(() => import('../components/RechargeDialog.jsx'))

const Ctx = createContext({ openRecharge: () => {} })
export const useRecharge = () => useContext(Ctx)

export function RechargeDialogProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [open, setOpen] = useState(false)
  const openRecharge = useCallback((r = {}) => { setRequest({ ...r, at: Date.now() }); setOpen(true) }, [])
  const close = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ openRecharge }), [openRecharge])
  return (
    <Ctx.Provider value={value}>
      {children}
      {request && <Suspense fallback={null}><RechargeDialog open={open} request={request} onClose={close} /></Suspense>}
    </Ctx.Provider>
  )
}

/**
 * Anciennes adresses, toujours utilisées : `/recharge?pack=…` (liens partagés, retour après connexion) et `/recharge/retour?ref=…`
 * (retour de Wave, fixé côté API). On ouvre la fenêtre par-dessus le studio.
 */
export function RechargeRoute() {
  const { openRecharge } = useRecharge()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const pack = params.get('pack')
  const ref = pathname.startsWith('/recharge/retour') ? params.get('ref') : null
  useEffect(() => { openRecharge({ pack, ref }) }, [openRecharge, pack, ref])
  return <Navigate to="/cinema" replace />
}

/** Bouton qui ouvre la fenêtre de recharge (en-tête, « solde insuffisant »). */
export function RechargeButton({ pack, children, ...rest }) {
  const { openRecharge } = useRecharge()
  return <button type="button" aria-haspopup="dialog" {...rest} onClick={() => openRecharge({ pack })}>{children}</button>
}
