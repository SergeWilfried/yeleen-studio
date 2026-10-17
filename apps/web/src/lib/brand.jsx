import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAssets } from './assets.jsx'

/**
 * Kit de marque : l'identité saisie une fois (nom, WhatsApp, logo, couleurs, ton, voix, style visuel)
 * et reprise par les écrans de création : Spot pub (brief, carte finale, prompts), Image et Vidéo (style de la marque).
 * Stocké en localStorage ; le logo est un asset de la bibliothèque (donc conservé comme les autres fichiers).
 */
const KEY = 'studio.brand.v1'
const OLD_SPOT_KEY = 'studio.spot.brand.v1' // ancien brouillon du brief, repris au premier lancement

export const LOOKS = [
  { id: 'bright', label: 'Lumineux', prompt: 'lumière naturelle, couleurs vives' },
  { id: 'warm', label: 'Chaleureux', prompt: 'tons chauds, ambiance conviviale' },
  { id: 'clean', label: 'Épuré', prompt: 'composition épurée, fond neutre' },
  { id: 'contrast', label: 'Contrasté', prompt: 'contrastes marqués, ombres profondes' },
  { id: 'natural', label: 'Naturel', prompt: 'matières naturelles, rendu authentique' },
  { id: 'luxe', label: 'Haut de gamme', prompt: 'finitions soignées, éclairage de studio' },
]
export const SWATCHES = ['#d6ff3f', '#ffb21f', '#ff5a36', '#e0307a', '#7a5cff', '#2f80ff', '#18b87a', '#f2f2ee']
export const BASES = ['#0d0e10', '#10261c', '#12203a', '#2a1230', '#3a1710', '#f4f1ea']

export const BLANK = { name: '', whatsapp: '', logoId: null, primary: '#d6ff3f', base: '#0d0e10', tone: 'warm', lang: 'fr', voice: 'Rachel', looks: [], notes: '', apply: true }

const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const load = () => {
  const saved = readJson(KEY)
  if (saved) return { ...BLANK, ...saved }
  const old = readJson(OLD_SPOT_KEY) // { name, whatsapp, tone, lang, voice }
  return old ? { ...BLANK, ...old } : BLANK
}

const norm = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null)
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Rapport de contraste WCAG entre deux couleurs hexadécimales. */
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
/** Couleur de texte lisible (noir ou blanc) sur un fond donné. */
export const inkOn = (bg) => (contrast(bg, '#111111') >= contrast(bg, '#ffffff') ? '#111111' : '#ffffff')
export const isHex = (h) => Boolean(norm(h))

/** Les couleurs de la marque, prêtes pour le plan de montage et les aperçus. */
export const brandColors = (b) => {
  const primary = norm(b.primary) ?? BLANK.primary
  const base = norm(b.base) ?? BLANK.base
  return { primary, base, onPrimary: inkOn(primary), ink: inkOn(base) }
}
/** Variables CSS appliquées sur un aperçu (carte finale, storyboard). */
export const brandVars = (c) => ({ '--b1': c.primary, '--b0': c.base, '--bt': c.onPrimary, '--bi': c.ink })

/** Le style visuel de la marque, en une phrase à ajouter aux prompts image et vidéo. */
export const brandPrompt = (b) => {
  const looks = LOOKS.filter((l) => b.looks.includes(l.id)).map((l) => l.prompt)
  const extra = b.notes.trim()
  return [...looks, ...(extra ? [extra] : [])].join(', ')
}
export const brandSet = (b) => Boolean(b.name.trim() && b.whatsapp.trim())

const Ctx = createContext(null)
export const useBrand = () => useContext(Ctx)

export function BrandProvider({ children }) {
  const [brand, setBrand] = useState(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(brand)) } catch { /* quota ou navigation privée */ } }, [brand])
  const patch = useCallback((p) => setBrand((b) => ({ ...b, ...p })), [])
  const reset = useCallback(() => setBrand(BLANK), [])
  const value = useMemo(() => ({ brand, patch, reset, colors: brandColors(brand), style: brandPrompt(brand) }), [brand, patch, reset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** URL affichable du logo (asset de la bibliothèque), ou null s'il manque. */
export function useLogoUrl(logoId) {
  const { assets, getFile } = useAssets()
  const asset = logoId ? assets.find((a) => a.id === logoId) : null
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!asset) return setUrl(null)
    let dead = false
    let made = null
    getFile(asset).then((f) => { if (!dead) { made = URL.createObjectURL(f); setUrl(made) } }).catch(() => setUrl(null))
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [asset?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}
