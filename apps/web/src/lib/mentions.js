/**
 * Références à des assets dans le texte d'un plan : « @marche » désigne un fichier de la bibliothèque.
 * Ce module ne touche ni au DOM ni à React : il décide, pour le modèle choisi, ce que devient chaque mention.
 *
 * - Modèle à éléments (Kling) : chaque image ou vidéo devient un élément cité dans le prompt par « @Element1 », « @Element2 »…
 * - Modèle à références (Seedance) : toute image, vidéo ou audio cité est une référence, numérotée par type et cité « @Image1 », « @Video1 », « @Audio1 ».
 * - Autres modèles : une image prend la place libre de l'image de départ, puis de fin ; un audio prend la piste audio.
 * - Ce que le modèle ne peut pas recevoir est « non utilisé » : le nom de l'asset reste dans le texte, rien n'est envoyé.
 */
export const MAX_ELEMENTS = 4

const MENTION = /@([\w-]+)/g

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset'

/** Le mot-clé d'un asset, unique parmi ceux déjà utilisés (`refs` : mot-clé → identifiant d'asset). */
export function tokenFor(asset, refs) {
  const base = slug(asset.name)
  for (let n = 1; ; n++) {
    const t = n === 1 ? base : `${base}-${n}`
    if (!refs[t] || refs[t] === asset.id) return t
  }
}

/** Mots-clés cités dans un texte qui désignent un asset connu, dans l'ordre d'apparition. */
export function tokensIn(text, refs) {
  const out = []
  for (const m of text.matchAll(MENTION)) if (refs[m[1]] && !out.includes(m[1])) out.push(m[1])
  return out
}

/**
 * @param plans  [{ text }] : les plans, dans l'ordre
 * @param refs   { mot-clé: assetId }
 * @param assets la bibliothèque
 * @param caps   capacités du modèle (startFrame, endFrame, audioRef, elements)
 * @param files  fichiers déjà posés dans les cases (start, end, audio) : ils gardent leur place
 * @returns { mentions: [{ token, asset, role, n? }], texts: [string], slots: { start, end, audio }, elements: [asset] }
 *   role : 'start' | 'end' | 'audio' | 'element' | 'unused'
 */
export function resolveMentions({ plans, refs, assets, caps, files = {} }) {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const order = []
  for (const p of plans) for (const t of tokensIn(p.text, refs)) if (!order.includes(t) && byId.has(refs[t])) order.push(t)
  const { rows, slots, elements, references } = assignRoles(order.map((token) => ({ token, asset: byId.get(refs[token]) })), caps, files)
  const by = Object.fromEntries(rows.map((m) => [m.token, m]))
  const texts = plans.map((p) => p.text.replace(MENTION, (all, t) => rewrite(by[t], all)))
  return { mentions: rows, texts, slots, elements, references }
}

const KIND_EN = { image: 'Image', video: 'Video', audio: 'Audio' } // les noms que le modèle attend dans le prompt
const rewrite = (m, original) => (!m ? original : m.role === 'element' ? `@Element${m.n}` : m.role === 'reference' ? `@${KIND_EN[m.asset.kind]}${m.n}` : m.asset.name)

/** Attribue à chaque référence (dans l'ordre) son rôle pour le modèle : élément, image de départ ou de fin, audio, ou rien. */
function assignRoles(list, caps, files) {
  let startFree = caps.startFrame !== 'none' && !files.start
  let endFree = Boolean(caps.endFrame) && !files.end
  let audioFree = Boolean(caps.audioRef) && !files.audio
  const slots = {}
  const elements = []
  const references = []
  const used = { image: 0, video: 0, audio: 0 }
  const rows = list.map(({ token, asset }) => {
    let role = 'unused'
    let n
    if (caps.references) {
      if (used[asset.kind] < caps.references[`${asset.kind}s`]) { used[asset.kind]++; references.push({ kind: asset.kind, asset }); role = 'reference'; n = used[asset.kind] }
    } else if (caps.elements) {
      if ((asset.kind === 'image' || asset.kind === 'video') && elements.length < (caps.maxElements ?? MAX_ELEMENTS)) { elements.push(asset); role = 'element'; n = elements.length }
    } else if (asset.kind === 'image') {
      if (startFree) { slots.start = asset; startFree = false; role = 'start' } else if (endFree) { slots.end = asset; endFree = false; role = 'end' }
    } else if (asset.kind === 'audio' && audioFree) { slots.audio = asset; audioFree = false; role = 'audio' }
    return { token, asset, role, n }
  })
  return { rows, slots, elements, references }
}

// --- Pièces jointes numérotées (écran Cinéma) : « @Image 1 », « @Vidéo 1 », « @Audio 1 » ---
const KIND_WORD = { image: 'Image', video: 'Vidéo', audio: 'Audio' }
export const ATTACH_PATTERN = '(?:Image|Vidéo|Audio) \\d+'

/** Numérote les pièces jointes par type, dans l'ordre d'ajout : [{ id, asset, token: 'Image 1' }, …]. */
export function labelAttachments(attachments, assets) {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const count = {}
  return attachments.filter((x) => byId.has(x.assetId)).map((x) => {
    const asset = byId.get(x.assetId)
    count[asset.kind] = (count[asset.kind] ?? 0) + 1
    return { id: x.id, asset, token: `${KIND_WORD[asset.kind]} ${count[asset.kind]}` }
  })
}

/**
 * Comme `resolveMentions`, mais le rôle vient des pièces jointes et non de ce que le texte cite : tout ce qui est joint
 * est envoyé (c'est ce que l'on voit dans la bande), le texte n'a plus qu'à nommer chaque pièce par « @Image 1 ».
 * @returns { items: [{ token, asset, role, n? }], texts, slots, elements }
 */
export function resolveAttachments({ attached, texts, caps, files = {} }) {
  const { rows, slots, elements, references } = assignRoles(attached.map(({ token, asset }) => ({ token, asset })), caps, files)
  // Un modèle à éléments qui exige aussi une image de départ (Kling) prend la première image jointe pour départ.
  if (caps.elements && caps.startFrame === 'required' && !files.start) {
    const first = rows.find((r) => r.asset.kind === 'image')
    if (first) slots.start = first.asset
  }
  const by = Object.fromEntries(rows.map((m) => [m.token, m]))
  const re = new RegExp(`@(${ATTACH_PATTERN})`, 'g')
  return { items: rows, texts: texts.map((t) => t.replace(re, (all, tok) => rewrite(by[tok], all))), slots, elements, references }
}

export const ROLE_LABEL = { reference: 'Référence', start: 'Image de départ', end: 'Image de fin', audio: 'Piste audio', element: 'Élément', unused: 'Non utilisé par ce modèle' }
