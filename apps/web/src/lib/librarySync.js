/**
 * Ma bibliothèque côté serveur (GET /assets, /favorites) : les fichiers générés gardés par l'API, et les favoris.
 * Fonctions pures, sans React ni navigateur : la bibliothèque locale (lib/assets.jsx) les applique quand l'API est branchée.
 *
 * Un fichier du serveur a pour identifiant « <génération>:<rang> » (`remoteId`). Une génération suivie dans cet onglet produit
 * le même fichier en local, repéré par le même `remoteId` : on fusionne au lieu de doubler.
 */
export const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) // graine stable pour la forme d'onde d'un fichier réel

/**
 * Identifiant serveur de la sortie `index` d'une génération réelle (`remoteId` de la génération, rendu par POST /jobs), seulement si
 * l'API a gardé le fichier (`stored`) : une sortie restée chez fal n'a pas d'entrée dans Ma bibliothèque côté serveur.
 */
export const remoteAssetId = (jobRemoteId, index, output) => (jobRemoteId && output?.stored ? `${jobRemoteId}:${index}` : null)

/** Un fichier du serveur au format d'un asset local. */
export function fromRemote(a, starred = false) {
  return {
    id: a.id, remoteId: a.id, kind: a.kind, source: 'generated', name: a.name, prompt: a.prompt ?? '', model: a.model ?? '', meta: null, cost: null,
    secs: a.secs ?? null, seed: hash(a.url), url: a.url, contentType: a.contentType ?? null, art: null, createdAt: a.createdAt, starred,
    origin: a.jobId ? { jobKey: null, index: a.index ?? 0, runId: null, step: null } : null,
  }
}

/**
 * Fusionne la bibliothèque locale et celle du serveur.
 * - Un fichier connu des deux côtés garde son entrée locale (identifiant, origine dans l'onglet) mais prend l'adresse durable du serveur.
 * - Un fichier du serveur absent en local est ajouté (autre appareil, autre navigateur, onglet fermé avant la fin).
 * - Favori : celui du serveur, ou l'étoile locale ; une étoile locale que le serveur ignore est à lui envoyer (`push`).
 * - Une entrée locale avec `remoteId` que le serveur ne connaît plus (supprimée ailleurs) est retirée, seulement si la liste du serveur
 *   est complète (`complete` : pas de page suivante) et si l'entrée n'est pas récente (`graceMs`) : sa copie dans D1 peut être en route.
 */
export function mergeRemote(local, remote, favMine, { now = Date.now(), graceMs = 10 * 60_000, complete = true } = {}) {
  const byRemote = new Map(remote.map((a) => [a.id, a]))
  const seen = new Set()
  const push = []
  const list = []
  for (const a of local) {
    if (!a.remoteId) { list.push(a); continue }
    const r = byRemote.get(a.remoteId)
    if (!r) {
      if (!complete || now - (a.createdAt ?? 0) < graceMs) list.push(a)
      continue
    }
    seen.add(r.id)
    const starred = favMine.has(r.id) || Boolean(a.starred)
    if (a.starred && !favMine.has(r.id)) push.push(r.id)
    list.push({ ...a, url: r.url, contentType: r.contentType ?? a.contentType, starred })
  }
  for (const r of remote) if (!seen.has(r.id)) list.push(fromRemote(r, favMine.has(r.id)))
  list.sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))
  return { list, push }
}

/** Favoris du serveur, par portée : { mine: Set, yeleen: Set }. */
export function favoriteSets(favorites) {
  const sets = { mine: new Set(), yeleen: new Set() }
  for (const f of favorites ?? []) sets[f.scope]?.add(f.id)
  return sets
}
