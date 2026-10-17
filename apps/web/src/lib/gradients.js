const HIGHLIGHT = 'radial-gradient(circle at 30% 22%,rgba(255,255,255,.22),transparent 45%)'

export const PALETTES = {
  home: ['#3a3a40,#121214', '#c9a24a,#3a2a0c', '#7a2a2a,#190a0a', '#d6ff3f,#2f3d08', '#4d8ad6,#101f3a', '#2c4a3a,#0a1510', '#e9e9e4,#7a7a76', '#1d3b5c,#080f1a', '#b8452a,#3a1109', '#6b5a8a,#15101f', '#aab3bd,#20262c', '#e8c23a,#2a2418'],
  video: ['#3a3a40,#121214', '#c9a24a,#3a2a0c', '#7a2a2a,#190a0a', '#2a5a4a,#08140f', '#4d8ad6,#101f3a', '#2c3a4a,#0a1015', '#b8452a,#3a1109', '#6b5a8a,#15101f', '#aab3bd,#20262c', '#1a3a5a,#05080f'],
  image: ['#3a2a1a,#0f0a06', '#6a2a3a,#150810', '#1a2a3a,#05080f', '#c9a27a,#2a1a10', '#2a4a5a,#080f14', '#8a5a3a,#1a0f08', '#5a3a6a,#10081a', '#d6b48a,#3a2a1a'],
}

/** Couleurs de départ et d'arrivée d'une entrée de palette (pour dessiner le même dégradé sur un canvas). */
export function paletteColors(i, palette = 'home') {
  const list = PALETTES[palette]
  return list[i % list.length].split(',')
}

/** Dégradé « média » déterministe : gradient(i, 'home') */
export function gradient(i, palette = 'home') {
  const list = PALETTES[palette]
  return `${HIGHLIGHT},linear-gradient(165deg,${list[i % list.length]})`
}
