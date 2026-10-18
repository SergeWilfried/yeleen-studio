/** Bibliothèque Yeleen (table catalog_items) : ce qui est publié, dans l'ordre voulu, sous la forme du fichier JSON d'origine. */
const parse = (s) => { try { return s ? JSON.parse(s) : null } catch { return null } }

export async function listCatalog(db) {
  const { results } = await db.prepare('SELECT * FROM catalog_items WHERE published = 1 ORDER BY sort, created_at, id').all()
  return results.map((r) => ({ id: r.id, kind: r.kind, category: r.category, name: r.name, url: r.url ?? undefined, secs: r.secs ?? undefined, art: parse(r.art) ?? undefined, seed: r.seed ?? undefined, placeholder: Boolean(r.placeholder) }))
}
export const catalogItemExists = async (db, id) => Boolean(await db.prepare('SELECT 1 AS ok FROM catalog_items WHERE id = ?1 AND published = 1').bind(id).first())
