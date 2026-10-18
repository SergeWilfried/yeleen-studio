/**
 * Fonctionnalités masquées aux utilisateurs (drapeaux). Le MVP est le studio Cinéma (avec la bibliothèque) : les autres écrans
 * sont éteints par défaut. On en allume en construisant avec `VITE_FEATURES`, liste séparée par des virgules :
 *
 *   VITE_FEATURES=image,video            allume Image et Vidéo ; `all` allume tout
 *
 * Écrans concernés : image, video, audio, spot (Spot pub), brand (Marque). C'est un choix de présentation, pas une protection :
 * l'API reste la même (la garde de l'accès, c'est Clerk). En développement, `.env.development` allume tout.
 */
export const FEATURE_NAMES = ['image', 'video', 'audio', 'spot', 'brand']

export function parseFeatures(value) {
  const list = String(value ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const all = list.includes('all')
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, all || list.includes(n)]))
}

export const features = parseFeatures(import.meta.env?.VITE_FEATURES)
