/**
 * « Ma bibliothèque » dans D1 : les fichiers importés et générés d'un utilisateur (les fichiers eux-mêmes sont dans R2), et ses favoris.
 * Suppression en deux temps : `deleted_at` (annulable) puis effacement définitif du fichier et de la ligne (`purgeDeleted`, tâche planifiée).
 */
const KIND_OF = (type) => (String(type).startsWith('image/') ? 'image' : String(type).startsWith('video/') ? 'video' : String(type).startsWith('audio/') ? 'audio' : null)
export const kindOfType = KIND_OF

/** Une ligne de la table → l'objet que reçoit l'interface (même forme qu'un asset local, avec `url` vers /files). */
export function toAsset(row, origin) {
  return {
    id: row.id, kind: row.kind, source: row.source, name: row.name, url: `${origin}/files/${row.r2_key}`, contentType: row.content_type, bytes: row.bytes,
    width: row.width, height: row.height, secs: row.secs, prompt: row.prompt, model: row.model, jobId: row.job_id, index: row.idx,
    createdAt: row.created_at, starred: Boolean(row.starred),
  }
}

const SELECT = `SELECT a.*, (f.item_id IS NOT NULL) AS starred FROM assets a LEFT JOIN favorites f ON f.user_id = a.user_id AND f.scope = 'mine' AND f.item_id = a.id`

export async function listAssets(db, userId, { limit = 60, before = null, kind = null, source = null } = {}) {
  const n = Math.min(Math.max(1, Number(limit) || 60), 200)
  const { results } = await db.prepare(`${SELECT} WHERE a.user_id = ?1 AND a.deleted_at IS NULL AND (?2 IS NULL OR a.created_at < ?2) AND (?3 IS NULL OR a.kind = ?3) AND (?4 IS NULL OR a.source = ?4)
    ORDER BY a.created_at DESC, a.id LIMIT ?5`).bind(userId, before, kind, source, n + 1).all()
  const rows = results.slice(0, n)
  return { rows, next: results.length > n ? rows[rows.length - 1].created_at : null }
}

export const getAsset = (db, userId, id) => db.prepare(`${SELECT} WHERE a.user_id = ?1 AND a.id = ?2 AND a.deleted_at IS NULL`).bind(userId, id).first()

export async function insertAsset(db, a) {
  await db.prepare(`INSERT INTO assets (id, user_id, kind, source, name, r2_key, content_type, bytes, width, height, secs, prompt, model, job_id, idx, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16) ON CONFLICT DO NOTHING`)
    .bind(a.id, a.userId, a.kind, a.source, a.name, a.r2Key, a.contentType ?? null, a.bytes ?? null, a.width ?? null, a.height ?? null, a.secs ?? null, a.prompt ?? null, a.model ?? null,
      a.jobId ?? null, a.idx ?? null, a.createdAt).run()
}

/** Les sorties d'une génération terminée entrent dans la bibliothèque (une seule fois par sortie) ; retourne les lignes de cette génération. */
export async function addGenerated(db, { userId, job, outputs, title, now = Date.now() }) {
  let i = 0
  for (const o of outputs) {
    const key = o.stored && typeof o.url === 'string' ? o.url.split('/files/')[1] : null
    const kind = KIND_OF(o.contentType)
    if (key && kind) {
      await insertAsset(db, { id: crypto.randomUUID(), userId, kind, source: 'generated', name: `${title}${outputs.length > 1 ? ` · ${i + 1}/${outputs.length}` : ''}`, r2Key: key,
        contentType: o.contentType, width: o.width, height: o.height, secs: kind === 'image' ? null : job.params?.secs ?? null, prompt: job.prompt, model: title, jobId: job.id, idx: i, createdAt: now })
    }
    i++
  }
  const { results } = await db.prepare(`${SELECT} WHERE a.user_id = ?1 AND a.job_id = ?2 AND a.deleted_at IS NULL ORDER BY a.idx`).bind(userId, job.id).all()
  return results
}

export async function renameAsset(db, userId, id, name) {
  const r = await db.prepare('UPDATE assets SET name = ?3 WHERE user_id = ?1 AND id = ?2 AND deleted_at IS NULL').bind(userId, id, name).run()
  return (r.meta?.changes ?? 0) > 0
}

/** Suppression douce de plusieurs assets (annulable) ; retourne le nombre de lignes touchées. */
export async function softDelete(db, userId, ids, now = Date.now()) {
  let n = 0
  for (const id of ids) n += (await db.prepare('UPDATE assets SET deleted_at = ?3 WHERE user_id = ?1 AND id = ?2 AND deleted_at IS NULL').bind(userId, id, now).run()).meta?.changes ?? 0
  return n
}
export async function restoreAssets(db, userId, ids) {
  let n = 0
  for (const id of ids) n += (await db.prepare('UPDATE assets SET deleted_at = NULL WHERE user_id = ?1 AND id = ?2 AND deleted_at IS NOT NULL').bind(userId, id).run()).meta?.changes ?? 0
  return n
}

export async function usedBytes(db, userId) {
  const r = await db.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM assets WHERE user_id = ?1 AND deleted_at IS NULL').bind(userId).first()
  return r?.n ?? 0
}

/** Efface pour de bon (fichier R2 puis ligne) ce qui est supprimé depuis plus de `graceMs` (un jour par défaut : le temps d'annuler). */
export async function purgeDeleted(db, bucket, { graceMs = 24 * 3600_000, now = Date.now(), limit = 200 } = {}) {
  const { results } = await db.prepare('SELECT id, r2_key FROM assets WHERE deleted_at IS NOT NULL AND deleted_at < ?1 LIMIT ?2').bind(now - graceMs, limit).all()
  let purged = 0
  for (const r of results) {
    try {
      if (bucket) await bucket.delete(r.r2_key)
      await db.prepare('DELETE FROM assets WHERE id = ?1').bind(r.id).run()
      await db.prepare("DELETE FROM favorites WHERE scope = 'mine' AND item_id = ?1").bind(r.id).run()
      purged++
    } catch (e) { console.error('purge', r.id, e.message) } // la ligne reste : nouvel essai à la prochaine tâche
  }
  return purged
}

// ── Favoris ──────────────────────────────────────────────────────────────────

export async function setFavorite(db, userId, scope, itemId, on, now = Date.now()) {
  if (on) await db.prepare('INSERT INTO favorites (user_id, scope, item_id, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING').bind(userId, scope, itemId, now).run()
  else await db.prepare('DELETE FROM favorites WHERE user_id = ?1 AND scope = ?2 AND item_id = ?3').bind(userId, scope, itemId).run()
}
export async function listFavorites(db, userId, scope) {
  const { results } = await db.prepare('SELECT item_id FROM favorites WHERE user_id = ?1 AND scope = ?2 ORDER BY created_at DESC').bind(userId, scope).all()
  return results.map((r) => r.item_id)
}
