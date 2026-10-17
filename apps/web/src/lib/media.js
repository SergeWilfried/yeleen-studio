import { paletteColors } from './gradients.js'
import montageClip from '../assets/hero/montage.mp4'
import pubsClip from '../assets/hero/pubs.mp4'

/**
 * Médias des assets. Les générations simulées n'ont pas de vrais fichiers : on les fabrique à la demande.
 * - image : PNG dessiné sur un canvas à partir du dégradé de l'asset
 * - vidéo : l'un des deux clips de démonstration fournis (de vrais fichiers lisibles)
 * - audio : WAV synthétisé (lisible)
 * Avec un vrai fournisseur, ces fonctions deviennent un simple `fetch(url)` vers le fichier généré.
 */
// Teintes vidéo les plus lisibles : l'aperçu d'une vidéo doit donner envie.
const VIVID = [1, 2, 3, 4, 6, 7, 9]
export const vividIndex = (seed) => VIVID[Math.abs(seed) % VIVID.length]

export const CLIPS = [montageClip, pubsClip]
export const clipFor = (seed) => CLIPS[Math.abs(seed) % CLIPS.length]

const blobOf = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

/** Image PNG d'un dégradé de palette (même rendu que le CSS : 165°, reflet en haut à gauche). */
export async function gradientPng(palette, index, w = 768, h = 768) {
  const [c1, c2] = paletteColors(index, palette)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const a = (165 * Math.PI) / 180
  const dx = Math.sin(a) * (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2
  const dy = -Math.cos(a) * (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2
  const lin = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy)
  lin.addColorStop(0, c1)
  lin.addColorStop(1, c2)
  ctx.fillStyle = lin
  ctx.fillRect(0, 0, w, h)
  const rad = ctx.createRadialGradient(w * 0.3, h * 0.22, 0, w * 0.3, h * 0.22, Math.max(w, h) * 0.45)
  rad.addColorStop(0, 'rgba(255,255,255,.22)')
  rad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = rad
  ctx.fillRect(0, 0, w, h)
  return blobOf(canvas)
}

/** WAV mono 16 bits : une phrase musicale courte dont la hauteur dépend de la graine. */
export function synthWav(seed, secs = 5) {
  const sr = 16000
  const n = Math.round(sr * Math.max(1, secs))
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n * 2, true)
  const base = 180 + (Math.abs(seed) % 7) * 30
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const env = Math.min(1, t * 8) * Math.min(1, (secs - t) * 4) * (0.55 + 0.45 * Math.sin(t * 5))
    const f = base * (1 + 0.25 * Math.sin(t * 2.3))
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * f * t) * 9000 * Math.max(0, env), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Première ou dernière image d'une vidéo, en PNG. */
export function grabFrame(url, which = 'last') {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.crossOrigin = 'anonymous' // fichiers réels hébergés ailleurs : sans cela l'image ne peut pas être exportée
    video.playsInline = true
    video.preload = 'auto'
    video.onerror = () => reject(new Error('Vidéo illisible'))
    video.onloadedmetadata = () => {
      video.currentTime = which === 'last' ? Math.max(0, video.duration - 0.08) : 0.05
    }
    video.onseeked = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      resolve(await blobOf(canvas))
    }
    video.src = url
  })
}

/* Stockage local des fichiers importés (IndexedDB), pour les retrouver après un rechargement. */
const DB = 'studio-assets'
const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1)
  req.onupgradeneeded = () => req.result.createObjectStore('blobs')
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
const tx = async (mode, fn) => {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const t = db.transaction('blobs', mode)
      const r = fn(t.objectStore('blobs'))
      t.oncomplete = () => resolve(r?.result)
      t.onerror = () => reject(t.error)
    })
  } catch {
    return undefined // IndexedDB indisponible (navigation privée…) : les imports restent en mémoire pour la session
  }
}
export const blobPut = (id, blob) => tx('readwrite', (s) => s.put(blob, id))
export const blobGet = (id) => tx('readonly', (s) => s.get(id))
export const blobDelete = (id) => tx('readwrite', (s) => s.delete(id))

/** Carte finale du spot en PNG (1080×1920) : nom, offre, prix et numéro WhatsApp. */
export async function endCardPng(m, logo = null) {
  const w = 1080
  const h = 1920
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, h)
  const b = m.brand ?? { primary: '#d6ff3f', base: '#0d0e10', onPrimary: '#111111', ink: '#ffffff' }
  g.addColorStop(0, b.base)
  g.addColorStop(1, m.brand ? b.base : '#1d2410')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const wrap = (text, font, maxW, y, lh, color) => {
    ctx.font = font
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    let line = ''
    const lines = []
    for (const word of text.split(' ')) {
      const t = line ? `${line} ${word}` : word
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word } else line = t
    }
    lines.push(line)
    lines.forEach((l, i) => ctx.fillText(l, w / 2, y + i * lh))
    return y + lines.length * lh
  }
  if (logo) {
    try {
      const img = await createImageBitmap(logo)
      const k = Math.min(420 / img.width, 260 / img.height)
      ctx.drawImage(img, (w - img.width * k) / 2, 640 - img.height * k, img.width * k, img.height * k)
    } catch { /* logo illisible : carte sans logo */ }
  }
  let y = wrap(m.endCard.title, '800 96px Arial, sans-serif', 880, 760, 108, b.ink)
  y = wrap(m.endCard.offer, '500 48px Arial, sans-serif', 860, y + 40, 62, b.ink)
  if (m.endCard.price) {
    ctx.font = '800 56px Arial, sans-serif'
    const tw = ctx.measureText(m.endCard.price).width + 80
    ctx.fillStyle = b.primary
    ctx.beginPath()
    ctx.roundRect((w - tw) / 2, y + 40, tw, 96, 48)
    ctx.fill()
    ctx.fillStyle = b.onPrimary
    ctx.fillText(m.endCard.price, w / 2, y + 108)
    y += 150
  }
  ctx.fillStyle = b.primary
  ctx.beginPath()
  ctx.roundRect(140, y + 80, w - 280, 120, 24)
  ctx.fill()
  ctx.fillStyle = b.onPrimary
  ctx.font = '800 48px Arial, sans-serif'
  ctx.fillText(`WhatsApp  +${m.endCard.whatsapp}`, w / 2, y + 156)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
