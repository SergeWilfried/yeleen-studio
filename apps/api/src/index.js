import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AuthError, verifyClerkToken } from './auth.js'
import { FalError, falClient } from './fal.js'
import { buildInput, endpointFor, outputsOf } from './inputs.js'
import { TOPUP_COUNTRIES, findPack, toE164 } from '@studio/catalog/packs'
import { addFavorite, assetView, catalog, deleteAsset, getAsset, insertUpload, ITEM_ID, listAssets, listFavorites, removeFavorite, SCOPES } from './library.js'
import { ledgerOf } from './mirror.js'
import { isBlocked } from './moderation.js'
import { PaygateError, paygateClient, verifySignature } from './paygate.js'
import { priceJob } from './pricing.js'
import { serveFile, storeOutputs, uploadKey } from './storage.js'
import { newReference, topupView } from './topups.js'
import { ensureUser, getUser, markWelcomed } from './users.js'

export { Account } from './account-do.js'

/**
 * API du studio. Le navigateur ne parle jamais à fal : tout passe ici (prix serveur, débit, appel, remboursement).
 * Chaque route (hors /health, /files et les webhooks) exige un jeton de session Clerk ; le compte est le `sub` du jeton. En local
 * (ENV=dev) sans CLERK_ISSUER, un compte `demo` unique sert à développer sans connexion. Les fichiers restent chez fal
 * (adresses temporaires) tant que R2 n'est pas branché ; le suivi se fait par interrogation, le webhook viendra ensuite.
 * Quand le bucket R2 (`FILES`) existe, chaque sortie y est copiée à la fin de la génération et servie par `/files/…`.
 * Les jetons s'achètent en FCFA par Mobile Money via paygate (`/topups`) ; paygate confirme par `/webhooks/payments` (signé).
 */
const app = new Hono()

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

app.use('*', async (c, next) => {
  const allowed = allowedOrigins(c.env)
  return cors({ origin: (o) => (allowed.includes(o) ? o : null), allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['content-type', 'range', 'authorization'], exposeHeaders: ['content-range', 'accept-ranges', 'content-length'] })(c, next)
})

// Garde : tout passe par ici sauf la santé, la Bibliothèque Yeleen (publique), les fichiers (adresses non devinables, lus par <img> et <video> sans en-tête) et les webhooks.
const OPEN = (p) => p === '/health' || p === '/catalog' || p.startsWith('/files/') || p.startsWith('/webhooks/')
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || OPEN(c.req.path)) return next()
  if (c.env.ENV === 'dev' && !c.env.CLERK_ISSUER) { c.set('uid', 'demo'); await provision(c); return next() } // développement local seulement
  if (!c.env.CLERK_ISSUER) return c.json({ error: 'auth_not_configured' }, 503) // en production, sans configuration : tout est refusé
  try {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { sub, claims } = await verifyClerkToken(token, { issuer: c.env.CLERK_ISSUER, authorizedParties: allowedOrigins(c.env) })
    c.set('uid', sub)
    c.set('claims', claims)
  } catch (e) {
    if (!(e instanceof AuthError)) throw e
    return c.json({ error: e.reason === 'jwks_unavailable' ? 'auth_unavailable' : 'unauthorized', reason: e.reason }, e.reason === 'jwks_unavailable' ? 503 : 401)
  }
  await provision(c, c.get('claims'))
  return next()
})

const accountId = (c) => c.get('uid')
// Le Durable Object d'un compte. Son nom (le `sub` Clerk) lui est passé dans `x-account` : il en a besoin pour ses copies dans D1.
const accountStub = (env, uid) => {
  const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(uid))
  return { fetch: (url, init = {}) => stub.fetch(url, { ...init, headers: { ...init.headers, 'x-account': uid } }) }
}
const account = (c) => accountStub(c.env, accountId(c))
const short = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null)
/**
 * Profil dans D1 à chaque utilisateur authentifié (voir users.js), et crédit de bienvenue unique s'il est configuré (WELCOME_JETONS, 0 par défaut :
 * l'argent offert est une décision de produit). Une panne de D1 est journalisée mais ne bloque jamais la requête.
 */
async function provision(c, claims = {}) {
  const db = c.env.DB
  if (!db) return
  const id = accountId(c)
  try {
    const user = await ensureUser(db, id, { email: short(claims.email), name: short(claims.name ?? claims.full_name), country: short(c.req.raw.cf?.country) })
    const welcome = Number(c.env.WELCOME_JETONS ?? 0)
    if (welcome > 0 && !user.welcomedAt) {
      const credited = await call(c, '/credit', { paymentId: 'welcome', amount: welcome }) // idempotent : rejoué, il ne crédite pas deux fois
      if (credited.ok) await markWelcomed(db, id)
    }
  } catch (e) {
    console.error('utilisateurs (D1)', e.message)
  }
}

const call = async (c, path, body) => {
  const res = await account(c).fetch(`https://account${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
  return res.json()
}
const fal = (c) => falClient({ key: c.env.FAL_KEY })

const MAX_UPLOAD = 25 * 1024 * 1024
const UPLOAD_TYPES = /^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|aac|ogg|webm|flac))$/

app.get('/health', (c) => c.json({ ok: true }))

// Fichiers d'entrée (image de départ, image de fin, audio) : déposés chez fal, l'adresse revient ici.
app.post('/uploads', async (c) => {
  const type = (c.req.header('content-type') ?? '').split(';')[0]
  if (!UPLOAD_TYPES.test(type)) return c.json({ error: 'unsupported_type' }, 415)
  if (Number(c.req.header('content-length') ?? 0) > MAX_UPLOAD) return c.json({ error: 'too_large' }, 413)
  const bytes = await c.req.arrayBuffer()
  if (!bytes.byteLength) return c.json({ error: 'empty' }, 400)
  if (bytes.byteLength > MAX_UPLOAD) return c.json({ error: 'too_large' }, 413)
  const name = (c.req.query('name') ?? 'fichier').replace(/[^\w.-]+/g, '_').slice(0, 80)
  try {
    return c.json({ url: await fal(c).upload(bytes, type, name) })
  } catch (e) {
    console.error('upload fal', e.message)
    return c.json({ error: 'provider' }, 502)
  }
})
app.get('/wallet', async (c) => c.json(await call(c, '/balance')))
// Mon profil (D1) et mon solde (Durable Object).
app.get('/me', async (c) => {
  if (!c.env.DB) return c.json({ error: 'db_unavailable' }, 503)
  const user = await getUser(c.env.DB, accountId(c))
  if (!user) return c.json({ error: 'not_found' }, 404)
  return c.json({ ...user, balance: (await call(c, '/balance')).balance })
})

// Ma bibliothèque (D1) : fichiers générés gardés dans R2, du plus récent au plus ancien ; `kind`, `before` et `limit` en option.
const withDb = (handler) => async (c) => {
  if (!c.env.DB) return c.json({ error: 'db_unavailable' }, 503)
  try {
    return await handler(c, c.env.DB)
  } catch (e) {
    console.error('bibliothèque (D1)', e.message)
    return c.json({ error: 'db_unavailable' }, 503)
  }
}
app.get('/assets', withDb(async (c, db) => {
  const { kind, limit, before } = c.req.query()
  return c.json({ assets: await listAssets(db, accountId(c), { origin: new URL(c.req.url).origin, kind, limit, before }) })
}))
// Import dans Ma bibliothèque : le fichier (corps de la requête, avec sa longueur) est écrit dans R2 sous `uploads/<compte>/…`, puis
// enregistré dans `assets` (source `upload`). Il suit ainsi l'utilisateur sur tous ses appareils. `name`, `secs`, `width`, `height` en paramètres.
// (Une génération utilise toujours POST /uploads : ses fichiers d'entrée vont chez fal, qui doit pouvoir les lire.)
const IMPORT_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|aac|ogg|webm|flac))$/
const MAX_IMPORT = { image: 25 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 100 * 1024 * 1024 }
const STREAM_FROM = 25 * 1024 * 1024 // au-delà, le corps est envoyé à R2 en flux, sans être chargé en mémoire
const num = (v, max) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 && n <= max ? n : null }
const IMPORT_KEY = /^[\w.-]{8,80}$/
/**
 * Identifiant d'un import. Avec une clé du client (`key`, stable pour un même fichier), il est dérivé du compte et de la clé : un nouvel
 * essai (réponse perdue, synchronisation suivante) retombe sur le même asset au lieu d'en créer un second. Sans clé, il est aléatoire.
 */
async function importId(account, key) {
  if (!key) return `up-${crypto.randomUUID()}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${account}:${key}`))
  return `up-${[...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}
app.post('/assets', withDb(async (c, db) => {
  const bucket = c.env.FILES
  if (!bucket) return c.json({ error: 'storage_unavailable' }, 503)
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!IMPORT_TYPES.test(type)) return c.json({ error: 'unsupported_type' }, 415)
  const kind = type.split('/')[0]
  const length = Number(c.req.header('content-length') ?? 0)
  if (!length) return c.json({ error: 'length_required' }, 411)
  if (length > MAX_IMPORT[kind]) return c.json({ error: 'too_large', max: MAX_IMPORT[kind] }, 413)
  const q = c.req.query()
  const name = (q.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || 'Fichier importé'
  if (q.key != null && !IMPORT_KEY.test(q.key)) return c.json({ error: 'invalid_key' }, 400)
  const origin = new URL(c.req.url).origin
  const id = await importId(accountId(c), q.key)
  const known = q.key ? await getAsset(db, accountId(c), id) : null
  if (known) return c.json({ asset: assetView(known, origin), replay: true }) // déjà reçu : rien n'est réécrit
  const key = uploadKey(accountId(c), id, type)
  const body = length > STREAM_FROM ? c.req.raw.body : await c.req.arrayBuffer()
  const stored = await bucket.put(key, body, { httpMetadata: { contentType: type } })
  const bytes = stored?.size ?? length
  if (!bytes || bytes > MAX_IMPORT[kind]) { await bucket.delete(key); return c.json({ error: bytes ? 'too_large' : 'empty' }, bytes ? 413 : 400) }
  try {
    const row = await insertUpload(db, accountId(c), { id, kind, name, key, contentType: type, bytes, secs: num(q.secs, 6 * 3600), width: num(q.width, 20000), height: num(q.height, 20000) })
    return c.json({ asset: assetView(row, origin) }, 201)
  } catch (e) {
    // Deux envois simultanés du même import : le premier a gagné, son fichier (même clé R2) reste.
    const winner = q.key ? await getAsset(db, accountId(c), id).catch(() => null) : null
    if (winner) return c.json({ asset: assetView(winner, origin), replay: true })
    await bucket.delete(key).catch(() => {}) // pas de fichier orphelin dans R2 si D1 refuse
    throw e
  }
}))
app.delete('/assets/:id', withDb(async (c, db) => (await deleteAsset(db, accountId(c), c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404))))

// Favoris, dans Ma bibliothèque (`mine`, identifiant d'un fichier) et dans la Bibliothèque Yeleen (`yeleen`, identifiant du catalogue).
app.get('/favorites', withDb(async (c, db) => c.json({ favorites: await listFavorites(db, accountId(c)) })))
const favorite = (add) => withDb(async (c, db) => {
  const { scope, id } = c.req.param()
  if (!SCOPES.includes(scope) || !ITEM_ID.test(id)) return c.json({ error: 'invalid_favorite' }, 400)
  await (add ? addFavorite(db, accountId(c), scope, id) : removeFavorite(db, accountId(c), scope, id))
  return c.json({ ok: true })
})
app.put('/favorites/:scope/:id', favorite(true))
app.delete('/favorites/:scope/:id', favorite(false))

// Bibliothèque Yeleen (D1, publique), au format de `public/catalog/yeleen.json` : le site la lit en réglant VITE_CATALOG_URL sur cette adresse.
app.get('/catalog', withDb(async (c, db) => {
  c.header('cache-control', 'public, max-age=300')
  return c.json(await catalog(db))
}))

// Mon historique de jetons (D1) : débits, remboursements, recharges, du plus récent au plus ancien ; `before` pour la page suivante.
app.get('/ledger', async (c) => {
  if (!c.env.DB) return c.json({ error: 'db_unavailable' }, 503)
  const { limit, before } = c.req.query()
  try {
    return c.json({ entries: await ledgerOf(c.env.DB, accountId(c), { limit, before }) })
  } catch (e) {
    console.error('grand livre (D1)', e.message)
    return c.json({ error: 'db_unavailable' }, 503)
  }
})

/**
 * Ce que la génération garde de sa demande, pour l'historique (copié dans D1, table `jobs`) : le texte (plans d'une vidéo séparés par « / »),
 * 2 000 caractères au plus, et les réglages (résolution, format, durée…) en JSON, sans les textes ni la clé de demande.
 */
function requestOf(req, texts) {
  const { prompt, plans, requestId, kind, modelId, inputs, ...rest } = req
  const params = JSON.stringify({ ...rest, ...(plans ? { durations: plans.map((p) => p.dur) } : {}) })
  return { prompt: texts.map((t) => t.trim()).filter(Boolean).join(' / ').slice(0, 2000) || null, params: params.length <= 4000 ? params : null, secs: typeof req.secs === 'number' ? req.secs : null }
}

// Soumission : contrôle du texte et prix serveur → débit → envoi à fal. Si l'envoi échoue, remboursement immédiat.
app.post('/jobs', async (c) => {
  const req = await c.req.json()
  const price = priceJob(req)
  if (!price.ok) return c.json({ error: price.error }, 400)
  const texts = req.kind === 'video' ? req.plans.map((p) => p.text) : req.kind === 'workflow' ? Object.values(req.inputs ?? {}).filter((v) => typeof v === 'string') : [req.prompt ?? '']
  if (isBlocked(texts.join(' '))) return c.json({ error: 'moderation' }, 422)
  // Garde-fou tant qu'il n'y a ni connexion ni plafond par compte : on refuse une seule demande très coûteuse.
  const cap = Number(c.env.MAX_JOB_COST ?? 250)
  if (price.cost > cap) return c.json({ error: 'too_expensive', max: cap }, 400)

  const id = crypto.randomUUID()
  // Clé de demande : la même demande rejouée (double clic, nouvel essai après une coupure) ne coûte qu'une fois.
  const key = typeof req.requestId === 'string' && /^[\w.-]{8,80}$/.test(req.requestId) ? req.requestId : null
  const claim = await call(c, '/job/claim', { key, jobId: id, max: Number(c.env.MAX_ACTIVE_JOBS ?? 6) })
  if (claim.existing) {
    const prev = await account(c).fetch(`https://account/job/get?id=${claim.existing}`).then((r) => r.json())
    return c.json({ jobId: claim.existing, status: prev?.status ?? 'IN_QUEUE', cost: prev?.cost ?? price.cost, balance: (await call(c, '/balance')).balance, deduped: true }, 202)
  }
  if (!claim.ok) return c.json(claim, 429) // { error: 'too_many_active', max }
  const debit = await call(c, '/debit', { jobId: id, amount: price.cost })
  if (!debit.ok) { await call(c, '/job/release', { jobId: id }); return c.json(debit, 402) } // { error: 'insufficient', missing } : le message que l'interface affiche déjà

  let sub
  const endpoint = req.kind === 'video' ? endpointFor(price.model, req) : price.model.endpoint
  try {
    const input = buildInput(req.kind, price.model, { ...req, count: price.count, endUserId: accountId(c) })
    sub = await fal(c).submit(endpoint, input)
  } catch (e) {
    const back = await call(c, '/refund', { jobId: id })
    await call(c, '/job/release', { jobId: id })
    console.error('submit fal', e.message)
    const policy = e instanceof FalError && e.isContentPolicy
    return c.json({ error: policy ? 'moderation' : 'provider', refunded: back.refunded ?? price.cost, balance: back.balance }, policy ? 422 : 502)
  }

  const job = { id, kind: req.kind, modelId: price.model.id, endpoint, cost: price.cost, count: price.count, status: 'IN_QUEUE', createdAt: Date.now(), ...sub, ...requestOf(req, texts) }
  await call(c, '/job/put', job)
  return c.json({ jobId: id, status: job.status, cost: price.cost, balance: debit.balance }, 202)
})

const view = (job, extra = {}) => ({ jobId: job.id, status: job.status, outputs: job.outputs, failure: job.failure, refund: job.refund ?? 0, ...extra })

// Suivi : on interroge fal tant que la génération est active ; un échec rembourse (une seule fois).
app.get('/jobs/:id', async (c) => {
  const job = await account(c).fetch(`https://account/job/get?id=${c.req.param('id')}`).then((r) => r.json())
  if (!job) return c.json({ error: 'not_found' }, 404)
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELED') return c.json(view(job, { balance: (await call(c, '/balance')).balance }))

  const client = fal(c)
  const fail = async (failure) => {
    const back = await call(c, '/refund', { jobId: job.id })
    const next = { ...job, status: 'FAILED', failure, refund: back.refunded ?? job.cost, finishedAt: Date.now() }
    await call(c, '/job/put', next)
    return c.json(view(next, { balance: back.balance }))
  }
  try {
    const st = await client.status(job.statusUrl)
    if (st.status !== 'COMPLETED') {
      const next = { ...job, status: st.status, ...(st.status === 'IN_PROGRESS' && !job.startedAt ? { startedAt: Date.now() } : {}) }
      if (next.status !== job.status) await call(c, '/job/put', next)
      return c.json(view(next, { queuePosition: st.queuePosition, logs: st.logs.slice(-3), balance: (await call(c, '/balance')).balance }))
    }
    let result
    try { result = await client.result(job.responseUrl) } catch (e) {
      console.error('résultat fal', e.message)
      return fail(e instanceof FalError && e.isContentPolicy ? 'moderation' : 'provider')
    }
    const found = outputsOf(job.kind, result)
    if (!found.length) return fail('provider')
    // Copie dans R2 : un seul suivi à la fois s'en charge ; les autres voient « enregistrement » et réessaient.
    if (job.storingAt && Date.now() - job.storingAt < 60_000) return c.json(view({ ...job, status: 'IN_PROGRESS' }, { logs: ['Enregistrement du résultat'], balance: (await call(c, '/balance')).balance }))
    if (c.env.FILES) await call(c, '/job/put', { ...job, status: 'IN_PROGRESS', storingAt: Date.now() })
    const outputs = await storeOutputs({ bucket: c.env.FILES, origin: new URL(c.req.url).origin, accountId: accountId(c), jobId: job.id, outputs: found })
    const next = { ...job, status: 'COMPLETED', outputs, finishedAt: Date.now(), storingAt: undefined }
    await call(c, '/job/put', next)
    return c.json(view(next, { balance: (await call(c, '/balance')).balance }))
  } catch (e) {
    console.error('suivi fal', e.message) // erreur passagère : l'interface réessaiera
    return c.json({ error: 'upstream' }, 502)
  }
})

// Fichiers générés, conservés dans R2. Accès par adresse (non devinable) tant qu'il n'y a pas de comptes.
app.get('/files/*', (c) => serveFile(c.env.FILES, c.req.path.slice('/files/'.length), c.req.raw.headers))

// Annulation : remboursement complet si la génération n'a pas commencé ; sinon fal la facture, rien n'est remboursé.
app.post('/jobs/:id/cancel', async (c) => {
  const job = await account(c).fetch(`https://account/job/get?id=${c.req.param('id')}`).then((r) => r.json())
  if (!job) return c.json({ error: 'not_found' }, 404)
  if (job.status !== 'IN_QUEUE' && job.status !== 'IN_PROGRESS') return c.json(view(job))
  try { await fal(c).cancel(job.cancelUrl) } catch (e) { console.error('annulation fal', e.message) }
  const back = job.status === 'IN_QUEUE' ? await call(c, '/refund', { jobId: job.id }) : { refunded: 0, balance: (await call(c, '/balance')).balance }
  const next = { ...job, status: 'CANCELED', refund: back.refunded ?? 0, finishedAt: Date.now() }
  await call(c, '/job/put', next)
  return c.json(view(next, { balance: back.balance }))
})

// Retours de fal par webhook : à écrire pour la production (signature, copie dans R2) ; en local le suivi par interrogation suffit.
app.post('/webhooks/fal', (c) => c.json({ error: 'not_implemented' }, 501))

// ── Recharges Mobile Money (paygate) ──────────────────────────────────────────
// Le prix vient du catalogue (packs), jamais du navigateur. La recharge est enregistrée dans le compte avant l'appel à paygate,
// avec la référence et le compte dans `metadata` : le webhook sait ainsi quel compte créditer, même s'il arrive avant notre réponse.

const paygate = (c) => (c.env.PAYGATE_URL && c.env.PAYGATE_KEY ? paygateClient({ url: c.env.PAYGATE_URL, key: c.env.PAYGATE_KEY }) : null)
const topupCountries = (env) => (env.TOPUP_COUNTRIES ?? 'BF').split(',').map((s) => s.trim()).filter((k) => TOPUP_COUNTRIES[k])
const getTopup = (c, ref) => account(c).fetch(`https://account/topup/get?ref=${encodeURIComponent(ref)}`).then((r) => r.json())
const PRE_AUTH_CODE = /^[A-Za-z0-9]{3,16}$/

/** Pays, opérateur et numéro (E.164) d'une demande, ou l'erreur à renvoyer. */
function payer(c, { country = 'BF', operator, phone }) {
  if (!topupCountries(c.env).includes(country)) return { error: 'unsupported_country' }
  if (!TOPUP_COUNTRIES[country].operators.includes(operator)) return { error: 'invalid_operator' }
  const e164 = toE164(phone, country)
  return e164 ? { country, operator, phone: e164 } : { error: 'invalid_phone' }
}

/** Retour de Wave (https seulement) : TOPUP_RETURN_URL, sinon la première origine https du site + /recharge/retour. */
function returnUrls(env, reference) {
  const base = env.TOPUP_RETURN_URL ?? (() => { const o = allowedOrigins(env).find((x) => x.startsWith('https://')); return o && `${o}/recharge/retour` })()
  if (!base?.startsWith('https://')) return {}
  const u = (result) => `${base}${base.includes('?') ? '&' : '?'}ref=${reference}&result=${result}`
  return { successUrl: u('success'), failedUrl: u('failed') }
}

// Erreur paygate → réponse : sa clé ou une adresse fausse sont nos pannes (502) ; le reste (montant, numéro…) est renvoyé tel quel.
const ours = (e) => !(e instanceof PaygateError) || e.status >= 500 || e.status === 401 || e.status === 404

// Avant d'afficher le bouton de paiement : ce moyen marche-t-il pour ce numéro, avec quelles limites et quelle validation (`authType`).
app.get('/topups/options', async (c) => {
  const pg = paygate(c)
  if (!pg) return c.json({ error: 'payments_not_configured' }, 503)
  const q = c.req.query()
  const who = payer(c, q)
  if (who.error) return c.json({ error: who.error }, 400)
  const amount = q.pack ? findPack(q.pack)?.fcfa : q.amount ? Number(q.amount) : undefined
  if (amount !== undefined && !(Number.isInteger(amount) && amount > 0)) return c.json({ error: 'invalid_amount' }, 400)
  try {
    return c.json({ ...(await pg.methods({ operator: who.operator, phone: who.phone, amount })), country: who.country, operator: who.operator, phone: who.phone })
  } catch (e) {
    if (ours(e)) { console.error('moyens paygate', e.message); return c.json({ error: 'provider' }, 502) }
    return c.json({ error: e.code }, e.status)
  }
})

app.get('/topups', async (c) => c.json({ topups: (await account(c).fetch('https://account/topup/list').then((r) => r.json())).map(topupView) }))

// Recharge : pack du catalogue → enregistrement → encaissement paygate. Orange Burkina exige d'abord un code à usage unique :
// paygate répond 422 sans rien créer, la recharge passe en `awaiting_code`, et on renvoie la même demande avec `reference` et `preAuthCode`.
app.post('/topups', async (c) => {
  const pg = paygate(c)
  if (!pg) return c.json({ error: 'payments_not_configured' }, 503)
  const req = await c.req.json().catch(() => ({}))
  const pack = findPack(req.pack)
  if (!pack) return c.json({ error: 'unknown_pack' }, 400)
  const who = payer(c, req)
  if (who.error) return c.json({ error: who.error }, 400)
  const code = typeof req.preAuthCode === 'string' && req.preAuthCode.trim() ? req.preAuthCode.trim() : null
  if (code && !PRE_AUTH_CODE.test(code)) return c.json({ error: 'invalid_pre_auth_code' }, 400)

  let topup
  if (req.reference) {
    // Nouvel essai (code reçu, ou coupure réseau) : mêmes détails, sinon paygate refuserait ; une recharge déjà lancée ne se relance pas.
    topup = typeof req.reference === 'string' ? await getTopup(c, req.reference) : null
    if (!topup) return c.json({ error: 'not_found' }, 404)
    const same = topup.pack === pack.id && topup.phone === who.phone && topup.operator === who.operator
    if (!same || (topup.status !== 'pending' && topup.status !== 'awaiting_code')) return c.json({ error: 'cannot_retry', topup: topupView(topup) }, 409)
  } else {
    const now = Date.now()
    topup = { reference: newReference(now), pack: pack.id, amountFcfa: pack.fcfa, jetons: pack.jetons, operator: who.operator, phone: who.phone, country: who.country, status: 'pending', createdAt: now, updatedAt: now }
    const opened = await call(c, '/topup/open', { topup, max: Number(c.env.MAX_OPEN_TOPUPS ?? 3) })
    if (!opened.ok) return c.json(opened, 429) // { error: 'too_many_open', max }
  }

  const patch = (fields) => call(c, '/topup/patch', { reference: topup.reference, from: ['pending', 'awaiting_code'], ...fields })
  let payment
  try {
    payment = await pg.collect({
      reference: topup.reference, amount: topup.amountFcfa, rail: 'mobile_money', operator: topup.operator, phone: topup.phone,
      metadata: { account: accountId(c), pack: topup.pack }, ...(code ? { preAuthCode: code } : {}), ...returnUrls(c.env, topup.reference),
    })
  } catch (e) {
    if (ours(e)) {
      // Rien ne dit que paygate n'a pas enregistré le paiement : on garde `pending`, un nouvel essai avec la même référence est sans risque.
      console.error('encaissement paygate', e.message)
      return c.json({ error: 'provider', topup: topupView(topup) }, 502)
    }
    if (e.code === 'pre_auth_code_required') {
      const r = await patch({ status: 'awaiting_code', codeInstructions: e.detail.codeInstructions ?? null })
      return c.json({ topup: topupView(r.topup ?? topup) })
    }
    if (e.code === 'invalid_pre_auth_code') return c.json({ error: e.code, topup: topupView(topup) }, 400) // rien n'est créé : on peut retaper le code
    if (e.status === 409) return c.json({ error: e.code, topup: topupView(topup) }, 409) // déjà créé chez paygate avec d'autres détails : le webhook dira la suite
    const r = await patch({ status: 'failed', failure: e.code })
    return c.json({ error: e.code, min: e.detail.min, max: e.detail.max, topup: topupView(r.topup ?? topup) }, e.status)
  }
  const out = await call(c, '/topup/apply', { reference: topup.reference, payment })
  return c.json({ topup: topupView(out.topup), balance: out.balance }, 201)
})

// Suivi par l'interface. Le webhook fait foi ; s'il tarde (plus de 30 s), on lit le paiement chez paygate, au plus toutes les 10 s.
app.get('/topups/:reference', async (c) => {
  let t = await getTopup(c, c.req.param('reference'))
  if (!t) return c.json({ error: 'not_found' }, 404)
  const pg = paygate(c)
  const now = Date.now()
  if (pg && (t.status === 'processing' || t.status === 'pending') && now - t.createdAt > 30_000 && now - (t.checkedAt ?? 0) > 10_000) {
    const from = ['pending', 'processing']
    try {
      t = (await call(c, '/topup/apply', { reference: t.reference, payment: await pg.collection(t.reference) })).topup
      await call(c, '/topup/patch', { reference: t.reference, from, checkedAt: now })
    } catch (e) {
      // Inconnue chez paygate après 2 min : l'encaissement n'a jamais été créé.
      if (e instanceof PaygateError && e.status === 404 && t.status === 'pending' && now - t.createdAt > 120_000) t = (await call(c, '/topup/patch', { reference: t.reference, from: ['pending'], status: 'failed', failure: 'not_created' })).topup ?? t
      else { console.error('lecture paygate', e.message); await call(c, '/topup/patch', { reference: t.reference, from, checkedAt: now }) }
    }
  }
  return c.json({ topup: topupView(t), balance: (await call(c, '/balance')).balance })
})

// Confirmations de paygate. Signature vérifiée sur le corps brut ; au moins une fois et dans le désordre : tout est idempotent
// (crédit par référence), et un 2xx rapide évite les nouvelles tentatives. Les jetons crédités sont ceux enregistrés, jamais recalculés.
const PAYMENT_EVENTS = ['payment.completed', 'payment.failed', 'payment.expired']
app.post('/webhooks/payments', async (c) => {
  const secret = c.env.PAYGATE_WEBHOOK_SECRET
  if (!secret) return c.json({ error: 'payments_not_configured' }, 503)
  const raw = await c.req.text()
  if (!(await verifySignature(secret, raw, c.req.header('paygate-signature') ?? null))) return c.json({ error: 'bad_signature' }, 401)
  let event
  try { event = JSON.parse(raw) } catch { return c.json({ error: 'invalid_json' }, 400) }
  const p = event?.data
  if (event?.type === 'payment.mismatch') console.error('paygate : paiement non conforme, rien n’est crédité', event.id, p?.reference)
  if (!PAYMENT_EVENTS.includes(event?.type)) return c.json({ ok: true, ignored: event?.type ?? null }) // ping, payment.unknown (versements), types futurs

  const uid = p?.metadata?.account
  if (typeof uid !== 'string' || !/^[\w-]{3,100}$/.test(uid) || typeof p.reference !== 'string') {
    console.error('webhook paygate sans compte', event.id)
    return c.json({ ok: true, ignored: 'no_account' })
  }
  const stub = accountStub(c.env, uid)
  const res = await stub.fetch('https://account/topup/apply', { method: 'POST', body: JSON.stringify({ reference: p.reference, payment: p, late: event.late === true }) })
  if (res.status === 404) { console.error('webhook paygate : recharge inconnue', p.reference); return c.json({ ok: true, ignored: 'unknown_reference' }) }
  const out = await res.json()
  if (out.mismatch) console.error('paygate : montant différent de la recharge, rien n’est crédité', p.reference, p.amount)
  if (out.credited && out.topup.late) console.warn('paygate : paiement tardif crédité', p.reference)
  return c.json({ ok: true })
})

export default app
