import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AuthError, verifyClerkToken } from './auth.js'
import { library, catalogRoutes } from './library-routes.js'
import { addGenerated, purgeDeleted, toAsset } from './library.js'
import { listJobs, mirrorJob, paramsOf, promptOf } from './jobs-store.js'
import { FalError, falClient } from './fal.js'
import { buildInput, endpointFor, outputsOf } from './inputs.js'
import { isBlocked } from './moderation.js'
import { priceJob } from './pricing.js'
import { serveFile, storeOutputs } from './storage.js'
import { ensureUser, getUser, markWelcomed } from './users.js'

export { Account } from './account-do.js'

/**
 * API du studio. Le navigateur ne parle jamais à fal : tout passe ici (prix serveur, débit, appel, remboursement).
 * Chaque route (hors /health, /files et les webhooks) exige un jeton de session Clerk ; le compte est le `sub` du jeton. En local
 * (ENV=dev) sans CLERK_ISSUER, un compte `demo` unique sert à développer sans connexion. Les fichiers restent chez fal
 * (adresses temporaires) tant que R2 n'est pas branché ; le suivi se fait par interrogation, le webhook viendra ensuite.
 * Quand le bucket R2 (`FILES`) existe, chaque sortie y est copiée à la fin de la génération et servie par `/files/…`.
 */
const app = new Hono()

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

app.use('*', async (c, next) => {
  const allowed = allowedOrigins(c.env)
  return cors({ origin: (o) => (allowed.includes(o) ? o : null), allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['content-type', 'range', 'authorization'], exposeHeaders: ['content-range', 'accept-ranges', 'content-length'] })(c, next)
})

// Garde : tout passe par ici sauf la santé, les fichiers (adresses non devinables, lus par <img> et <video> sans en-tête) et les webhooks.
const OPEN = (p) => p === '/health' || p.startsWith('/files/') || p.startsWith('/webhooks/')
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
const account = (c) => c.env.ACCOUNT.get(c.env.ACCOUNT.idFromName(accountId(c)))
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

/** Travail secondaire (copie dans D1) : en production il continue après la réponse ; sans contexte (tests), on l'attend. Il ne fait jamais échouer la requête. */
async function later(c, promise, what) {
  const task = Promise.resolve(promise).catch((e) => console.error(`${what} (D1)`, e.message))
  try { c.executionCtx.waitUntil(task) } catch { await task }
}
/** Enregistre une génération dans le Durable Object (l'autorité) puis en copie dans D1 pour l'historique. */
async function saveJob(c, job) {
  await call(c, '/job/put', job)
  if (c.env.DB) await later(c, mirrorJob(c.env.DB, accountId(c), job), 'historique')
}

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

// Soumission : contrôle du texte et prix serveur → débit → envoi à fal. Si l'envoi échoue, remboursement immédiat.
app.post('/jobs', async (c) => {
  const req = await c.req.json()
  const price = priceJob(req)
  if (!price.ok) return c.json({ error: price.error }, 400)
  if (isBlocked(req.kind === 'video' ? req.plans.map((p) => p.text).join(' ') : req.kind === 'workflow' ? Object.values(req.inputs ?? {}).filter((v) => typeof v === 'string').join(' ') : req.prompt ?? '')) return c.json({ error: 'moderation' }, 422)
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

  const job = { id, kind: req.kind, modelId: price.model.id, title: price.model.name, prompt: promptOf(req), params: paramsOf(req, { count: price.count, title: price.model.name }), endpoint, cost: price.cost, count: price.count, status: 'IN_QUEUE', createdAt: Date.now(), ...sub }
  await saveJob(c, job)
  return c.json({ jobId: id, status: job.status, cost: price.cost, balance: debit.balance }, 202)
})

const view = (job, extra = {}) => ({ jobId: job.id, status: job.status, outputs: job.outputs, failure: job.failure, refund: job.refund ?? 0, ...extra })

// Mes générations (historique dans D1), les plus récentes d'abord : ?limit=30&before=<date de création de la dernière reçue>.
app.get('/jobs', async (c) => {
  if (!c.env.DB) return c.json({ error: 'db_unavailable' }, 503)
  const q = c.req.query()
  return c.json(await listJobs(c.env.DB, accountId(c), { limit: q.limit, before: q.before ? Number(q.before) : null }))
})

// Suivi : on interroge fal tant que la génération est active ; un échec rembourse (une seule fois).
app.get('/jobs/:id', async (c) => {
  const job = await account(c).fetch(`https://account/job/get?id=${c.req.param('id')}`).then((r) => r.json())
  if (!job) return c.json({ error: 'not_found' }, 404)
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELED') return c.json(view(job, { balance: (await call(c, '/balance')).balance }))

  const client = fal(c)
  const fail = async (failure) => {
    const back = await call(c, '/refund', { jobId: job.id })
    const next = { ...job, status: 'FAILED', failure, refund: back.refunded ?? job.cost, finishedAt: Date.now() }
    await saveJob(c, next)
    return c.json(view(next, { balance: back.balance }))
  }
  try {
    const st = await client.status(job.statusUrl)
    if (st.status !== 'COMPLETED') {
      const next = { ...job, status: st.status }
      if (next.status !== job.status) await saveJob(c, next)
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
    if (c.env.FILES) await call(c, '/job/put', { ...job, status: 'IN_PROGRESS', storingAt: Date.now() }) // marqueur interne : pas de copie dans D1
    const outputs = await storeOutputs({ bucket: c.env.FILES, origin: new URL(c.req.url).origin, accountId: accountId(c), jobId: job.id, outputs: found })
    const next = { ...job, status: 'COMPLETED', outputs, finishedAt: Date.now(), storingAt: undefined }
    await saveJob(c, next)
    // Les sorties copiées dans R2 entrent dans « Ma bibliothèque » (une seule fois par sortie) ; l'interface les reçoit tout de suite.
    let assets
    if (c.env.DB && c.env.FILES) {
      try { assets = (await addGenerated(c.env.DB, { userId: accountId(c), job: next, outputs, title: job.title ?? job.modelId })).map((r) => toAsset(r, new URL(c.req.url).origin)) } catch (e) { console.error('bibliothèque (D1)', e.message) }
    }
    return c.json(view(next, { assets, balance: (await call(c, '/balance')).balance }))
  } catch (e) {
    console.error('suivi fal', e.message) // erreur passagère : l'interface réessaiera
    return c.json({ error: 'upstream' }, 502)
  }
})

// Ma bibliothèque (importés et générés), mes favoris, et la bibliothèque Yeleen.
app.route('/library', library)
app.route('/catalog', catalogRoutes)

// Fichiers générés et importés, conservés dans R2. Accès par adresse (non devinable) tant qu'il n'y a pas de comptes.
app.get('/files/*', (c) => serveFile(c.env.FILES, c.req.path.slice('/files/'.length), c.req.raw.headers))

// Annulation : remboursement complet si la génération n'a pas commencé ; sinon fal la facture, rien n'est remboursé.
app.post('/jobs/:id/cancel', async (c) => {
  const job = await account(c).fetch(`https://account/job/get?id=${c.req.param('id')}`).then((r) => r.json())
  if (!job) return c.json({ error: 'not_found' }, 404)
  if (job.status !== 'IN_QUEUE' && job.status !== 'IN_PROGRESS') return c.json(view(job))
  try { await fal(c).cancel(job.cancelUrl) } catch (e) { console.error('annulation fal', e.message) }
  const back = job.status === 'IN_QUEUE' ? await call(c, '/refund', { jobId: job.id }) : { refunded: 0, balance: (await call(c, '/balance')).balance }
  const next = { ...job, status: 'CANCELED', refund: back.refunded ?? 0, finishedAt: Date.now() }
  await saveJob(c, next)
  return c.json(view(next, { balance: back.balance }))
})

// Retours de fal par webhook : à écrire pour la production (signature, copie dans R2) ; en local le suivi par interrogation suffit.
app.post('/webhooks/fal', (c) => c.json({ error: 'not_implemented' }, 501))
app.post('/webhooks/payments', (c) => c.json({ error: 'not_implemented' }, 501))

/** Tâche planifiée (voir `triggers.crons` de wrangler.jsonc) : efface pour de bon les fichiers supprimés depuis plus d'un jour. */
async function scheduled(_event, env, ctx) {
  if (env.DB) ctx.waitUntil(purgeDeleted(env.DB, env.FILES).then((n) => console.log(`purge : ${n} fichier(s) effacé(s)`)))
}

export default { fetch: (request, env, ctx) => app.fetch(request, env, ctx), scheduled }
