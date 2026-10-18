/**
 * Lectures de D1 pour l'application : « Ma bibliothèque » (fichiers générés gardés dans R2), favoris des deux bibliothèques,
 * et Bibliothèque Yeleen (`catalog_items`), rendue au format de `public/catalog/yeleen.json` pour que le site n'ait qu'une adresse à changer.
 */
const page = (limit, max = 200) => Math.min(Math.max(Number(limit) || 50, 1), max)
const KINDS = ['image', 'video', 'audio']
export const SCOPES = ['mine', 'yeleen']
export const ITEM_ID = /^[\w:.-]{1,120}$/

/** Fichiers d'un compte, du plus récent au plus ancien ; `url` est l'adresse servie par l'API (`/files/…`). */
export async function listAssets(db, account, { origin, kind, limit, before } = {}) {
  const where = ['user_id = ?1', 'deleted_at IS NULL']
  const args = [account]
  if (KINDS.includes(kind)) { args.push(kind); where.push(`kind = ?${args.length}`) }
  if (before) { args.push(Number(before)); where.push(`created_at < ?${args.length}`) }
  args.push(page(limit))
  const { results } = await db.prepare(`SELECT id, kind, source, name, r2_key, content_type, width, height, secs, prompt, model, job_id, idx, created_at
    FROM assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?${args.length}`).bind(...args).all()
  return results.map((a) => ({
    id: a.id, kind: a.kind, source: a.source, name: a.name, url: `${origin}/files/${a.r2_key}`, contentType: a.content_type,
    width: a.width, height: a.height, secs: a.secs, prompt: a.prompt, model: a.model, jobId: a.job_id, index: a.idx, createdAt: a.created_at,
  }))
}

/** Suppression douce : le fichier reste dans R2 jusqu'au nettoyage. Vrai si le fichier existait et n'était pas déjà supprimé. */
export async function deleteAsset(db, account, id, now = Date.now()) {
  const r = await db.prepare('UPDATE assets SET deleted_at = ?3 WHERE id = ?2 AND user_id = ?1 AND deleted_at IS NULL').bind(account, id, now).run()
  if ((r.meta?.changes ?? 0) > 0) await db.prepare("DELETE FROM favorites WHERE user_id = ?1 AND scope = 'mine' AND item_id = ?2").bind(account, id).run()
  return (r.meta?.changes ?? 0) > 0
}

export async function listFavorites(db, account) {
  const { results } = await db.prepare('SELECT scope, item_id, created_at FROM favorites WHERE user_id = ?1 ORDER BY created_at DESC').bind(account).all()
  return results.map((f) => ({ scope: f.scope, id: f.item_id, createdAt: f.created_at }))
}

export const addFavorite = (db, account, scope, id, now = Date.now()) =>
  db.prepare('INSERT INTO favorites (user_id, scope, item_id, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING').bind(account, scope, id, now).run()

export const removeFavorite = (db, account, scope, id) =>
  db.prepare('DELETE FROM favorites WHERE user_id = ?1 AND scope = ?2 AND item_id = ?3').bind(account, scope, id).run()

/** Bibliothèque Yeleen publiée, dans l'ordre choisi (`sort`), au format de `yeleen.json` : { items: [{ id, kind, category, name, url, secs, art, seed, placeholder }] }. */
export async function catalog(db) {
  const { results } = await db.prepare('SELECT id, kind, category, name, url, secs, art, seed, placeholder FROM catalog_items WHERE published = 1 ORDER BY sort, created_at').bind().all()
  return {
    items: results.map((e) => {
      let art = null
      try { art = e.art ? JSON.parse(e.art) : null } catch { /* exemple illisible : ignoré */ }
      return { id: e.id, kind: e.kind, category: e.category, name: e.name, url: e.url ?? undefined, secs: e.secs ?? undefined, art: art ?? undefined, seed: e.seed ?? 0, placeholder: Boolean(e.placeholder) }
    }),
  }
}
