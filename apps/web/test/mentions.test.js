import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelAttachments, resolveAttachments, resolveMentions, tokenFor, tokensIn } from '../src/lib/mentions.js'

const hippo = { id: 'a1', kind: 'image', name: 'Flux 3' }
const market = { id: 'a2', kind: 'image', name: 'Marché de Ouaga' }
const clip = { id: 'a3', kind: 'video', name: 'Clip' }
const voice = { id: 'a4', kind: 'audio', name: 'Voix' }
const assets = [hippo, market, clip, voice]
const refs = { 'flux-3': 'a1', 'marche-de-ouaga': 'a2', clip: 'a3', voix: 'a4' }
const ltx = { startFrame: 'required', endFrame: true, audioRef: false, elements: false }
const kling = { startFrame: 'required', endFrame: true, audioRef: false, elements: true }
const t2v = { startFrame: 'none', endFrame: false, audioRef: false, elements: false }
const h3 = { startFrame: 'optional', endFrame: true, audioRef: true, elements: false }

test('le mot-clé est le nom sans accents ni espaces, rendu unique si besoin', () => {
  assert.equal(tokenFor(market, {}), 'marche-de-ouaga')
  assert.equal(tokenFor({ id: 'z', kind: 'image', name: 'Flux 3' }, { 'flux-3': 'a1' }), 'flux-3-2')
  assert.equal(tokenFor(hippo, { 'flux-3': 'a1' }), 'flux-3')
})

test('seules les mentions connues sont repérées, dans l’ordre, sans doublon', () => {
  assert.deepEqual(tokensIn('@clip puis @inconnu et @flux-3 encore @clip', refs), ['clip', 'flux-3'])
})

test('Kling : images et vidéos deviennent des éléments cités par @ElementN', () => {
  const r = resolveMentions({ plans: [{ text: 'Avec @flux-3 devant @marche-de-ouaga' }], refs, assets, caps: kling, files: { start: {} } })
  assert.deepEqual(r.mentions.map((m) => [m.role, m.n]), [['element', 1], ['element', 2]])
  assert.equal(r.texts[0], 'Avec @Element1 devant @Element2')
  assert.deepEqual(r.elements.map((a) => a.id), ['a1', 'a2'])
})

test('Kling : l’audio n’est pas utilisable, le nom reste dans le texte', () => {
  const r = resolveMentions({ plans: [{ text: 'sur @voix' }], refs, assets, caps: kling })
  assert.equal(r.mentions[0].role, 'unused')
  assert.equal(r.texts[0], 'sur Voix')
})

test('autres modèles : la première image prend le départ, la suivante la fin, le reste est ignoré', () => {
  const r = resolveMentions({ plans: [{ text: '@flux-3 vers @marche-de-ouaga puis @clip' }], refs, assets, caps: ltx })
  assert.deepEqual(r.mentions.map((m) => m.role), ['start', 'end', 'unused'])
  assert.equal(r.slots.start.id, 'a1')
  assert.equal(r.slots.end.id, 'a2')
  assert.equal(r.texts[0], 'Flux 3 vers Marché de Ouaga puis Clip')
})

test('une case déjà remplie garde sa place : la mention prend la suivante', () => {
  const r = resolveMentions({ plans: [{ text: '@flux-3' }], refs, assets, caps: ltx, files: { start: {} } })
  assert.equal(r.mentions[0].role, 'end')
})

test('texte seul : aucune entrée possible, tout est non utilisé', () => {
  const r = resolveMentions({ plans: [{ text: '@flux-3 @voix' }], refs, assets, caps: t2v })
  assert.deepEqual(r.mentions.map((m) => m.role), ['unused', 'unused'])
})

test('un audio prend la piste audio quand le modèle en accepte une', () => {
  const r = resolveMentions({ plans: [{ text: '@voix' }], refs, assets, caps: h3 })
  assert.equal(r.mentions[0].role, 'audio')
  assert.equal(r.slots.audio.id, 'a4')
})

test('plusieurs plans : l’ordre suit les plans, et un asset supprimé de la bibliothèque est ignoré', () => {
  const r = resolveMentions({ plans: [{ text: 'a' }, { text: '@marche-de-ouaga' }, { text: '@flux-3' }], refs: { ...refs, fantome: 'zz' }, assets, caps: ltx })
  assert.deepEqual(r.mentions.map((m) => m.token), ['marche-de-ouaga', 'flux-3'])
  assert.equal(r.slots.start.id, 'a2')
  assert.equal(resolveMentions({ plans: [{ text: '@fantome' }], refs: { fantome: 'zz' }, assets, caps: ltx }).texts[0], '@fantome')
})

test('au plus quatre éléments', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, kind: 'image', name: `Img ${i}` }))
  const rs = Object.fromEntries(many.map((a, i) => [`img-${i}`, a.id]))
  const r = resolveMentions({ plans: [{ text: many.map((_, i) => `@img-${i}`).join(' ') }], refs: rs, assets: many, caps: kling })
  assert.equal(r.elements.length, 4)
  assert.equal(r.mentions.filter((m) => m.role === 'unused').length, 2)
})

test('pièces jointes : numérotées par type, dans l’ordre d’ajout', () => {
  const att = [{ id: 'x1', assetId: 'a2' }, { id: 'x2', assetId: 'a3' }, { id: 'x3', assetId: 'a1' }, { id: 'x4', assetId: 'absent' }]
  const l = labelAttachments(att, assets)
  assert.deepEqual(l.map((i) => i.token), ['Image 1', 'Vidéo 1', 'Image 2'])
  assert.deepEqual(l.map((i) => i.asset.id), ['a2', 'a3', 'a1'])
})

test('pièces jointes sur Kling : tout ce qui est joint devient un élément, le texte cite @ElementN', () => {
  const attached = labelAttachments([{ id: 'x1', assetId: 'a1' }, { id: 'x2', assetId: 'a2' }, { id: 'x3', assetId: 'a4' }], assets)
  const r = resolveAttachments({ attached, texts: ['@Image 1 salue @Image 2 sur @Audio 1'], caps: kling, files: { start: {} } })
  assert.deepEqual(r.items.map((i) => [i.token, i.role, i.n]), [['Image 1', 'element', 1], ['Image 2', 'element', 2], ['Audio 1', 'unused', undefined]])
  assert.equal(r.texts[0], '@Element1 salue @Element2 sur Voix')
})

test('pièces jointes sur un autre modèle : départ, fin, audio selon la place', () => {
  const attached = labelAttachments([{ id: 'x1', assetId: 'a1' }, { id: 'x2', assetId: 'a2' }, { id: 'x3', assetId: 'a4' }], assets)
  const r = resolveAttachments({ attached, texts: ['de @Image 1 vers @Image 2'], caps: { ...h3, startFrame: 'optional' } })
  assert.deepEqual(r.items.map((i) => i.role), ['start', 'end', 'audio'])
  assert.equal(r.texts[0], 'de Flux 3 vers Marché de Ouaga')
})

test('Kling : la première image jointe sert aussi d’image de départ', () => {
  const attached = labelAttachments([{ id: 'x1', assetId: 'a3' }, { id: 'x2', assetId: 'a2' }, { id: 'x3', assetId: 'a1' }], assets)
  const r = resolveAttachments({ attached, texts: [''], caps: kling })
  assert.equal(r.slots.start.id, 'a2')
  assert.equal(r.elements.length, 3) // la vidéo et les deux images restent des éléments
  assert.equal(resolveAttachments({ attached, texts: [''], caps: kling, files: { start: {} } }).slots.start, undefined)
})

const seedance = { startFrame: 'optional', endFrame: true, audioRef: true, elements: false, references: { images: 30, videos: 10, audios: 10 } }

test('Seedance : tout ce qui est joint est une référence, numérotée par type en anglais comme le modèle l’attend', () => {
  const attached = labelAttachments([{ id: 'x1', assetId: 'a1' }, { id: 'x2', assetId: 'a3' }, { id: 'x3', assetId: 'a2' }, { id: 'x4', assetId: 'a4' }], assets)
  const r = resolveAttachments({ attached, texts: ['@Image 1 et @Image 2 regardent @Vidéo 1, voix @Audio 1'], caps: seedance })
  assert.deepEqual(r.items.map((i) => [i.token, i.role, i.n]), [['Image 1', 'reference', 1], ['Vidéo 1', 'reference', 1], ['Image 2', 'reference', 2], ['Audio 1', 'reference', 1]])
  assert.equal(r.texts[0], '@Image1 et @Image2 regardent @Video1, voix @Audio1')
  assert.deepEqual(r.references.map((x) => x.kind), ['image', 'video', 'image', 'audio'])
  assert.deepEqual(r.slots, {})
})

test('Seedance : au-delà de la limite d’un type, la référence est ignorée', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, kind: 'video', name: `V ${i}` }))
  const attached = labelAttachments(many.map((a, i) => ({ id: `x${i}`, assetId: a.id })), many)
  const r = resolveAttachments({ attached, texts: [''], caps: seedance })
  assert.equal(r.references.length, 10)
  assert.equal(r.items.filter((i) => i.role === 'unused').length, 2)
})

test('Seedance : les mentions par nom deviennent aussi des références numérotées', () => {
  const r = resolveMentions({ plans: [{ text: 'de @flux-3 vers @clip avec @voix' }], refs, assets, caps: seedance })
  assert.equal(r.texts[0], 'de @Image1 vers @Video1 avec @Audio1')
})
