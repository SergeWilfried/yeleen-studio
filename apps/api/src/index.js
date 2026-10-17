import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { FalError, falClient } from './fal.js'
import { buildInput, endpointFor, outputsOf } from './inputs.js'
import { isBlocked } from './moderation.js'
import { priceJob } from './pricing.js'
import { serveFile, storeOutputs } from './storage.js'

export { Account } from './account-do.js'

/**
 * API du studio. Le navigateur ne parle jamais à fal : tout passe ici (prix serveur, débit, appel, remboursement).
 * Gabarit : l'identité du compte est fixe (`demo`) tant que la connexion n'existe pas ; les fichiers restent chez fal
 * (adresses temporaires) tant que R2 n'est pas branché ; le suivi se fait par interrogation, le webhook viendra ensuite.
 * Quand le bucket R2 (`FILES`) existe, chaque sortie y est copiée à la fin de la génération et servie par `/files/…`.
 */
const app = new Hono()

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return cors({ origin: (o) => (allowed.includes(o) ? o : null), allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'range'], exposeHeaders: ['content-range', 'accept-ranges', 'content-length'] })(c, next)
})

const accountId = () => 'demo' // TODO : identité tirée de la session (code WhatsApp ou Google)
const account = (c) => c.env.ACCOUNT.get(c.env.ACCOUNT.idFromName(accountId()))
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
    const input = buildInput(req.kind, price.model, { ...req, count: price.count, endUserId: accountId() })
    sub = await fal(c).submit(endpoint, input)
  } catch (e) {
    const back = await call(c, '/refund', { jobId: id })
    await call(c, '/job/release', { jobId: id })
    console.error('submit fal', e.message)
    const policy = e instanceof FalError && e.isContentPolicy
    return c.json({ error: policy ? 'moderation' : 'provider', refunded: back.refunded ?? price.cost, balance: back.balance }, policy ? 422 : 502)
  }

  const job = { id, kind: req.kind, modelId: price.model.id, endpoint, cost: price.cost, count: price.count, status: 'IN_QUEUE', createdAt: Date.now(), ...sub }
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
      const next = { ...job, status: st.status }
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
    const outputs = await storeOutputs({ bucket: c.env.FILES, origin: new URL(c.req.url).origin, accountId: accountId(), jobId: job.id, outputs: found })
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
app.post('/webhooks/payments', (c) => c.json({ error: 'not_implemented' }, 501))

export default app
