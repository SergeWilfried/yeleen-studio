/**
 * Styles proposés dans le sélecteur à vignettes de l'écran Image. Chaque style ajoute une consigne de rendu à la description.
 * `poster` est un simple dégradé : ce sont des repères de couleur, pas des aperçus réels du rendu.
 */
const grad = (a, b) => `linear-gradient(135deg,${a},${b})`

export const IMAGE_STYLES = [
  { id: 'none', label: 'Sans style', poster: grad('#2a2b2e', '#17181b'), prompt: '' },
  { id: 'photo', label: 'Photo réaliste', poster: grad('#c9a27c', '#3b2a22'), prompt: 'photographie réaliste, lumière naturelle, grande netteté' },
  { id: 'cinema', label: 'Cinéma', poster: grad('#e0a24a', '#15323a'), prompt: 'plan de film, éclairage cinématographique, profondeur de champ, grain léger' },
  { id: '3d', label: 'Rendu 3D', poster: grad('#7ac6ff', '#4b3ad6'), prompt: 'rendu 3D, matières lisses, éclairage de studio, personnages stylisés' },
  { id: 'anime', label: 'Anime', poster: grad('#ff8fb5', '#6a5cff'), prompt: 'illustration de style anime, traits nets, couleurs vives' },
  { id: 'illustration', label: 'Illustration', poster: grad('#f4d35e', '#ee6c4d'), prompt: 'illustration éditoriale dessinée à la main, aplats de couleur' },
  { id: 'watercolor', label: 'Aquarelle', poster: grad('#bfe3d0', '#e9b8d6'), prompt: 'peinture à l’aquarelle, transparences, bords doux' },
  { id: 'neon', label: 'Néon', poster: grad('#18e0c8', '#d12bd9'), prompt: 'ambiance néon nocturne, reflets, couleurs saturées' },
  { id: 'bw', label: 'Noir et blanc', poster: grad('#e8e8e4', '#1a1a1a'), prompt: 'photographie noir et blanc, contraste marqué' },
  { id: 'vintage', label: 'Vintage', poster: grad('#d9b779', '#7a4a2b'), prompt: 'photo argentique des années 70, couleurs passées, grain' },
]
export const styleById = (id) => IMAGE_STYLES.find((s) => s.id === id) ?? IMAGE_STYLES[0]
