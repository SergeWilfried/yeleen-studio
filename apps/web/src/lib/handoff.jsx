import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from './toasts.jsx'

/**
 * « Envoyer vers » : transporte un asset d'un écran à un autre.
 * `sendTo({ target, ...détails })` mémorise la demande puis navigue ; le panneau de destination la récupère
 * à son montage avec `take(target)` (une seule fois) et remplit l'entrée correspondante.
 *
 * Cibles : `video.create` ({ slot: 'start' | 'end' | 'audio', assetId, frame?, modelId? }),
 *          `video.edit` ({ tool, assetId }), `cinema.recipe` ({ recipeId, assetId }).
 */
const Ctx = createContext(null)
export const useHandoff = () => useContext(Ctx)

const ROUTES = { 'video.create': '/video', 'video.edit': '/video', 'cinema.recipe': '/cinema' }

export function HandoffProvider({ children }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [pending, setPending] = useState(null)
  const ref = useRef(null)
  ref.current = pending

  const sendTo = useCallback((spec, message) => {
    setPending(spec)
    ref.current = spec
    if (message) toast(message)
    navigate(ROUTES[spec.target])
  }, [navigate, toast])

  const take = useCallback((target) => {
    const p = ref.current
    if (!p || p.target !== target) return null
    ref.current = null
    setPending(null)
    return p
  }, [])

  const value = useMemo(() => ({ pending, sendTo, take }), [pending, sendTo, take])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
