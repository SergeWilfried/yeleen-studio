/** Choix court en une rangée : même composant visuel que les sélecteurs de mode de l'écran Vidéo. */
export default function Segment({ label, value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}
