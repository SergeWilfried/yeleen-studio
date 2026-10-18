import { flagFor } from '../lib/flags.js'

/** Pastille ronde au drapeau d'un pays ; sans drapeau connu, une pastille neutre. */
export default function Flag({ country, size = 36 }) {
  const f = flagFor(country)
  return (
    <span className="flag" role="img" aria-label={f ? `Accent : ${f.name}` : 'Accent inconnu'} title={f ? `Accent ${f.accent}` : undefined}
      style={{ '--s': `${size}px`, ...(f ? { backgroundImage: `url("${f.src}")` } : null) }} />
  )
}
