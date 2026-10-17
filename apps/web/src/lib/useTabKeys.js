/**
 * Clavier d'une liste d'onglets (modèle ARIA) : flèches, Début, Fin. Active et focalise l'onglet voisin.
 * À poser sur le conteneur `role="tablist"` ; chaque onglet porte `role="tab"` et `tabIndex` (0 si actif, -1 sinon).
 */
export default function useTabKeys() {
  return (e) => {
    const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')]
    const i = tabs.indexOf(document.activeElement)
    if (i < 0) return
    const last = tabs.length - 1
    const target = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1, Home: 0, End: last }[e.key]
    if (target === undefined) return
    e.preventDefault()
    tabs[target].focus()
    tabs[target].click()
  }
}
