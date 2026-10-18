import { Hono } from 'hono'
import { catalogItemExists, listCatalog } from './catalog.js'
import { addGenerated, getAsset, insertAsset, kindOfType, listAssets, listFavorites, renameAsset, restoreAssets, setFavorite, softDelete, toAsset, usedBytes } from './library.js'

/**
 * Ma bibliothèque, mes favoris et la bibliothèque Yeleen. Toutes ces routes passent la garde d'authentification (`uid`) et ont besoin de D1.
 * Les fichiers importés vont dans R2 (`library/<utilisateur>/<id>.<ext>`) et se lisent par /files, comme les sorties de génération.
 */
export const library = new Hono()
const uid = (c) => c.get('uid')
const origin = (c) => new URL(c.req.url).origin

// Types acceptés à l'import (la même famille que les entrées envoyées à fal, plus les vidéos) et tailles maximales.
const TYPES = /^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|aac|ogg|webm|flac)|video\/(mp4|webm|quicktime))$/
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }
const MAX_BYTES = { image: 25 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 100 * 1024 * 1024 }
const DEFAULT_QUOTA = 2 * 1024 ** 3 // 2 Gio par utilisateur (MAX_LIBRARY_BYTES)
const clean = (s, max = 120) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)

library.use('*', async (c, next) => (c.env.DB ? next() : c.json({ error: 'db_unavailable' }, 503)))

library.get('/', async (c) => {
  const q = c.req.query()
  const kind = ['image', 'video', 'audio'].includes(q.kind) ? q.kind : null
  const source = ['upload', 'generated'].includes(q.source) ? q.source : null
  const { rows, next } = await listAssets(c.env.DB, uid(c), { limit: q.limit, before: q.before ? Number(q.before) : null, kind, source })
  return c.json({ assets: rows.map((r) => toAsset(r, origin(c))), next })
})

// Import d'un fichier dans la bibliothèque : le corps de la requête est le fichier, envoyé tel quel dans R2.
library.post('/uploads', async (c) => {
  if (!c.env.FILES) return c.json({ error: 'storage_unavailable' }, 503)
  const type = (c.req.header('content-type') ?? '').split(';')[0].toLowerCase()
  if (!TYPES.test(type)) return c.json({ error: 'unsupported_type' }, 415)
  const kind = kindOfType(type)
  const size = Number(c.req.header('content-length') ?? 0)
  if (!(size > 0)) return c.json({ error: 'length_required' }, 411)
  if (size > MAX_BYTES[kind]) return c.json({ error: 'too_large', max: MAX_BYTES[kind] }, 413)
  const quota = Number(c.env.MAX_LIBRARY_BYTES ?? DEFAULT_QUOTA)
  if ((await usedBytes(c.env.DB, uid(c))) + size > quota) return c.json({ error: 'quota_exceeded', max: quota }, 413)

  const id = crypto.randomUUID()
  const key = `library/${uid(c)}/${id}.${EXT[type]}`
  const name = clean(c.req.query('name')).replace(/\.[^.]+$/, '') || 'Fichier'
  const secs = Number(c.req.query('secs'))
  try {
    await c.env.FILES.put(key, c.req.raw.body, { httpMetadata: { contentType: type } })
  } catch (e) {
    console.error('import R2', e.message)
    return c.json({ error: 'storage' }, 502)
  }
  try {
    await insertAsset(c.env.DB, { id, userId: uid(c), kind, source: 'upload', name, r2Key: key, contentType: type, bytes: size, secs: kind !== 'image' && secs > 0 && secs < 36000 ? Math.round(secs * 10) / 10 : null, createdAt: Date.now() })
  } catch (e) {
    await c.env.FILES.delete(key).catch(() => {}) // pas de fichier orphelin si la ligne n'a pas pu être écrite
    throw e
  }
  return c.json(toAsset(await getAsset(c.env.DB, uid(c), id), origin(c)), 201)
})

library.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = clean(body.name)
  if (!name) return c.json({ error: 'invalid_name' }, 400)
  return (await renameAsset(c.env.DB, uid(c), c.req.param('id'), name)) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
})

const idsOf = async (c) => { const b = await c.req.json().catch(() => ({})); return Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string').slice(0, 100) : [] }
library.post('/delete', async (c) => c.json({ deleted: await softDelete(c.env.DB, uid(c), await idsOf(c)) }))
library.post('/restore', async (c) => c.json({ restored: await restoreAssets(c.env.DB, uid(c), await idsOf(c)) }))

// Favoris : `mine` (un de mes assets) ou `yeleen` (un élément du catalogue).
library.get('/favorites', async (c) => {
  const scope = c.req.query('scope')
  if (!['mine', 'yeleen'].includes(scope)) return c.json({ error: 'invalid_scope' }, 400)
  return c.json({ ids: await listFavorites(c.env.DB, uid(c), scope) })
})
const favorite = (on) => async (c) => {
  const scope = c.req.param('scope')
  const id = c.req.param('id')
  if (!['mine', 'yeleen'].includes(scope)) return c.json({ error: 'invalid_scope' }, 400)
  if (on) { // on ne met en favori que ce qui existe (et, pour « mine », ce qui est à soi)
    const exists = scope === 'mine' ? Boolean(await getAsset(c.env.DB, uid(c), id)) : await catalogItemExists(c.env.DB, id)
    if (!exists) return c.json({ error: 'not_found' }, 404)
  }
  await setFavorite(c.env.DB, uid(c), scope, id, on)
  return c.json({ ok: true })
}
library.put('/favorites/:scope/:id', favorite(true))
library.delete('/favorites/:scope/:id', favorite(false))

/** Bibliothèque Yeleen : les éléments publiés. */
export const catalogRoutes = new Hono()
catalogRoutes.get('/', async (c) => (c.env.DB ? c.json({ items: await listCatalog(c.env.DB) }) : c.json({ error: 'db_unavailable' }, 503)))

export { addGenerated }
