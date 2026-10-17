/**
 * Stockage des fichiers générés dans R2. Les adresses de fal sont temporaires : à la fin d'une génération on copie
 * chaque sortie dans le bucket et on la sert depuis l'API (`/files/…`), avec les requêtes par plage que demandent
 * les lecteurs vidéo pour avancer dans un clip. Les clés contiennent l'identifiant (non devinable) de la génération.
 */
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm' }
const PREFIX = 'outputs/'

export const keyFor = (accountId, jobId, index, contentType) => `${PREFIX}${accountId}/${jobId}/${index}.${EXT[contentType] ?? 'bin'}`

/**
 * Copie les sorties dans le bucket. Si la copie d'un fichier échoue, il garde l'adresse de fal : la génération est payée,
 * on ne la fait pas échouer pour un problème de stockage.
 * Retourne les sorties avec, pour chaque fichier copié, `url` = adresse de l'API et `stored: true`.
 */
export async function storeOutputs({ bucket, origin, accountId, jobId, outputs, fetch: f = fetch }) {
  if (!bucket) return outputs
  return Promise.all(outputs.map(async (o, i) => {
    const key = keyFor(accountId, jobId, i, o.contentType)
    try {
      const res = await f(o.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const httpMetadata = { contentType: o.contentType ?? res.headers.get('content-type') ?? 'application/octet-stream' }
      try {
        await bucket.put(key, res.body, { httpMetadata }) // flux direct quand la longueur est connue
      } catch {
        const again = await f(o.url) // sinon on charge le fichier en mémoire
        await bucket.put(key, await again.arrayBuffer(), { httpMetadata })
      }
      return { ...o, url: `${origin}/files/${key}`, stored: true }
    } catch (e) {
      console.error('copie R2', e.message)
      return { ...o, stored: false }
    }
  }))
}

/** Réponse HTTP pour un fichier du bucket, avec prise en charge de l'en-tête Range. */
export async function serveFile(bucket, key, headers) {
  if (!bucket || !key.startsWith(PREFIX) || key.includes('..')) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } })
  const ranged = headers.get('range')
  const obj = await bucket.get(key, ranged ? { range: headers } : undefined)
  if (!obj) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } })

  const out = new Headers()
  out.set('content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
  out.set('accept-ranges', 'bytes')
  out.set('cache-control', 'public, max-age=31536000, immutable') // la clé ne change jamais de contenu
  if (obj.etag) out.set('etag', obj.etag)
  const r = obj.range
  if (ranged && r && r.offset != null) {
    out.set('content-range', `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`)
    out.set('content-length', String(r.length))
    return new Response(obj.body, { status: 206, headers: out })
  }
  out.set('content-length', String(obj.size))
  return new Response(obj.body, { status: 200, headers: out })
}
