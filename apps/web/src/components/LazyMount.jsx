import { useEffect, useRef, useState } from 'react'

/** Ne monte son contenu que lorsqu'il approche de l'écran (une seule fois). */
export default function LazyMount({ children, minHeight = 320, rootMargin = '400px' }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return undefined
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) {
      setReady(true)
      return undefined
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true)
        io.disconnect()
      }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ready, rootMargin])

  return <div ref={ref} style={ready ? undefined : { minHeight }}>{ready ? children : null}</div>
}
