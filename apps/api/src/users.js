/**
 * Utilisateurs dans D1 : une ligne par compte Clerk, créée à la première requête authentifiée.
 * D1 ne tient que le profil (pour l'analyse et les rapports) ; le portefeuille et les générations restent dans le Durable Object du compte,
 * seul écrivain de l'argent. Un échec de D1 ne doit jamais bloquer une requête : l'appelant journalise et continue.
 */
const TOUCH_MS = 10 * 60_000 // « dernière activité » : au plus une écriture par utilisateur et par 10 minutes
const MAX_SEEN = 5000

// Dans cette instance du Worker : utilisateur → dernier passage par D1. Évite d'interroger la base à chaque requête.
const seen = new Map()

export const resetUserCache = () => seen.clear()

/**
 * Garantit la ligne de l'utilisateur et retourne { created, welcomedAt }. Sans effet (et sans appel à D1) si on l'a vu il y a moins de 10 minutes.
 * `profile` : { email, name, country } quand on les connaît (un NULL n'efface jamais une valeur connue).
 */
export async function ensureUser(db, id, profile = {}, now = Date.now()) {
  const last = seen.get(id)
  if (last && now - last.at < TOUCH_MS) return { created: false, welcomedAt: last.welcomedAt, cached: true }

  const { email = null, name = null, country = null } = profile
  const ins = await db.prepare('INSERT INTO users (id, created_at, last_seen_at, email, name, country) VALUES (?1, ?2, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO NOTHING')
    .bind(id, now, email, name, country).run()
  const created = (ins.meta?.changes ?? 0) > 0
  if (!created) {
    await db.prepare('UPDATE users SET last_seen_at = ?2, email = COALESCE(?3, email), name = COALESCE(?4, name) WHERE id = ?1')
      .bind(id, now, email, name).run()
  }
  const row = await db.prepare('SELECT welcomed_at FROM users WHERE id = ?1').bind(id).first()
  if (seen.size >= MAX_SEEN) seen.clear()
  seen.set(id, { at: now, welcomedAt: row?.welcomed_at ?? null })
  return { created, welcomedAt: row?.welcomed_at ?? null }
}

/** Note que le crédit de bienvenue a été accordé (une seule fois : sans effet s'il l'est déjà). */
export async function markWelcomed(db, id, now = Date.now()) {
  const r = await db.prepare('UPDATE users SET welcomed_at = ?2 WHERE id = ?1 AND welcomed_at IS NULL').bind(id, now).run()
  const entry = seen.get(id)
  if (entry) entry.welcomedAt = now
  return (r.meta?.changes ?? 0) > 0
}

export const getUser = (db, id) =>
  db.prepare('SELECT id, created_at AS createdAt, last_seen_at AS lastSeenAt, email, name, country, welcomed_at AS welcomedAt FROM users WHERE id = ?1').bind(id).first()
