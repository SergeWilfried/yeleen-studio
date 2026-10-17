import { useEffect, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')

/** Compte à rebours en secondes → « 02 h 53 m 15 s » */
export default function useCountdown(startSeconds) {
  const [left, setLeft] = useState(startSeconds)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  return { label: `${pad(h)} h ${pad(m)} m ${pad(left % 60)} s`, left }
}
