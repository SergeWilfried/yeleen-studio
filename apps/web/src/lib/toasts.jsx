import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const Ctx = createContext(null)
export const useToast = () => useContext(Ctx)

/** Messages brefs en bas d'écran, avec une action facultative (ex. Annuler). Annoncés aux lecteurs d'écran. */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const toast = useCallback((text, action) => {
    const id = ++seq.current
    setItems((xs) => [...xs.slice(-2), { id, text, action }])
    setTimeout(() => dismiss(id), action ? 7000 : 4000)
  }, [dismiss])
  const value = useMemo(() => toast, [toast])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && <button type="button" onClick={() => { t.action.onClick(); dismiss(t.id) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
