import { assetItems, jobItem, ledgerItem, topupItem, walletHistory, write } from './mirror.js'
import { applyPayment, isOpen } from './topups.js'
import { credit, debit, emptyWallet, refund } from './wallet.js'

const DEV_SEED = 240 // jetons offerts à un compte neuf, en développement seulement
const TOPUP_INDEX = 200 // recharges gardées dans l'historique du compte
const OPEN_WINDOW = 20 * 60_000 // une recharge ouverte depuis plus longtemps ne compte plus dans la limite
const OUTBOX_WARN = 5000 // au-delà, D1 est en panne depuis longtemps : on le signale (rien n'est jeté)
const ACCOUNT_ID = /^[\w-]{3,100}$/

/**
 * Durable Object : un compte = un portefeuille + ses générations + ses recharges. Les requêtes d'un même compte passent l'une
 * après l'autre, donc un débit et son remboursement ne peuvent pas se croiser.
 *
 * Chaque mouvement de jetons et chaque recharge est aussi copié dans D1 (voir mirror.js) : d'abord dans une file (`outbox`) gardée ici,
 * puis écrit dans D1. Si D1 ne répond pas, la file attend la requête suivante ; la réponse au client n'en dépend jamais.
 * Le Durable Object ne connaît pas son propre nom : le Worker l'envoie dans l'en-tête `x-account`.
 */
export class Account {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.accountId = null
    this.flushing = null
  }

  /** Met des éléments dans la file vers D1, puis tente de la vider (en tâche de fond quand le runtime le permet). */
  async record(...items) {
    if (!this.env.DB) return
    const outbox = (await this.state.storage.get('outbox')) ?? []
    outbox.push(...items)
    await this.state.storage.put('outbox', outbox)
    const p = this.flush()
    if (this.state.waitUntil) this.state.waitUntil(p)
    else await p
  }

  /** À chaque requête : s'il reste des éléments en file (D1 était en panne) ou si l'historique n'est pas encore copié, on réessaie. */
  async retry() {
    if (!this.env.DB || this.flushing || !this.accountId) return
    const pending = ((await this.state.storage.get('outbox')) ?? []).length > 0 || !(await this.state.storage.get('mirrored'))
    if (!pending) return
    const p = this.flush()
    if (this.state.waitUntil) this.state.waitUntil(p)
    else await p
  }

  /** Écrit la file dans D1, dans l'ordre ; s'arrête à la première erreur. Une seule à la fois ; reprend l'historique au premier passage. */
  flush() {
    this.flushing ??= this.drain().catch((e) => console.error('copie D1', e.message)).finally(() => { this.flushing = null })
    return this.flushing
  }

  async drain() {
    const storage = this.state.storage
    const account = this.accountId ?? (this.accountId = (await storage.get('account')) ?? null)
    if (!account || !this.env.DB) return
    if (!(await storage.get('mirrored'))) {
      // Premier passage : tout ce qui existait avant D1 (lignes sans solde), après la file : une ligne déjà en file (avec son solde)
      // passe la première, la même ligne reprise de l'historique est alors ignorée. Rejoué, cela ne change rien.
      const w = await storage.get('wallet')
      const refs = (await storage.get('topups')) ?? []
      const topups = (await Promise.all(refs.map((r) => storage.get(`topup:${r}`)))).filter(Boolean)
      const outbox = (await storage.get('outbox')) ?? []
      await storage.put('outbox', [...outbox, ...(w ? walletHistory(w) : []), ...topups.map(topupItem)])
      await storage.put('mirrored', true)
    }
    // Jusqu'à ce que la file soit vide : d'autres requêtes peuvent y ajouter des éléments pendant qu'on écrit.
    for (let items; (items = (await storage.get('outbox')) ?? []).length;) {
      if (items.length > OUTBOX_WARN) console.error('copie D1 : file de', items.length, 'éléments pour', account)
      let done = 0
      try {
        for (const item of items) { await write(this.env.DB, account, item); done++ }
      } finally {
        // On retire seulement les éléments écrits, au début de la file : ceux ajoutés entre-temps restent.
        if (done) await storage.put('outbox', ((await storage.get('outbox')) ?? []).slice(done))
      }
    }
  }

  async wallet() {
    let w = await this.state.storage.get('wallet')
    if (!w) {
      w = emptyWallet()
      if (this.env.ENV === 'dev') credit(w, { paymentId: 'dev-seed', amount: DEV_SEED })
      await this.state.storage.put('wallet', w)
      if (w.balance && (await this.state.storage.get('mirrored'))) await this.record(ledgerItem('credit', 'dev-seed', DEV_SEED, w.balance))
    }
    return w
  }

  /** Tient la liste des générations actives du compte ; une réservation oubliée depuis plus de 3 h est considérée comme perdue. */
  async track(jobId, active) {
    const now = Date.now()
    const map = (await this.state.storage.get('active')) ?? {}
    for (const [id, at] of Object.entries(map)) if (now - at > 3 * 3600_000) delete map[id]
    if (active) map[jobId] = map[jobId] ?? now
    else delete map[jobId]
    await this.state.storage.put('active', map)
  }

  async fetch(request) {
    const url = new URL(request.url)
    const { pathname } = url
    const who = request.headers.get('x-account')
    if (who && who !== this.accountId && ACCOUNT_ID.test(who)) {
      this.accountId = who
      if ((await this.state.storage.get('account')) !== who) await this.state.storage.put('account', who)
    }
    await this.retry()

    if (pathname === '/job/get') return Response.json((await this.state.storage.get(`job:${url.searchParams.get('id')}`)) ?? null)
    if (pathname === '/job/put') {
      const job = await request.json()
      await this.state.storage.put(`job:${job.id}`, job)
      await this.track(job.id, job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS') // une génération terminée libère sa place
      if (!job.storingAt) await this.record(jobItem(job), ...assetItems(job)) // l'étape « enregistrement en cours » n'est pas copiée
      return Response.json({ ok: true })
    }
    // Réservation d'une génération : même clé de demande → même génération (pas de second débit) ; sinon une place parmi
    // les générations actives du compte (au plus `max`), réservée tout de suite pour que deux envois simultanés ne la dépassent pas.
    if (pathname === '/job/claim') {
      const { key, jobId, max } = await request.json()
      const seen = key ? await this.state.storage.get(`idem:${key}`) : null
      if (seen) return Response.json({ ok: true, existing: seen })
      const active = Object.keys((await this.state.storage.get('active')) ?? {})
      if (active.length >= max) return Response.json({ ok: false, error: 'too_many_active', max }, { status: 429 })
      if (key) await this.state.storage.put(`idem:${key}`, jobId)
      await this.track(jobId, true)
      return Response.json({ ok: true })
    }
    if (pathname === '/job/release') {
      await this.track((await request.json()).jobId, false)
      return Response.json({ ok: true })
    }

    // Recharges Mobile Money : `topup:<référence>`, plus la liste des références (les plus récentes d'abord) pour l'historique.
    if (pathname === '/topup/get') return Response.json((await this.state.storage.get(`topup:${url.searchParams.get('ref')}`)) ?? null)
    if (pathname === '/topup/list') {
      const refs = ((await this.state.storage.get('topups')) ?? []).slice(0, Number(url.searchParams.get('limit') ?? 50))
      const found = await Promise.all(refs.map((r) => this.state.storage.get(`topup:${r}`)))
      return Response.json(found.filter(Boolean))
    }
    // Ouverture : au plus `max` recharges ouvertes à la fois (chacune envoie une demande sur un téléphone), vérifié et réservé d'un coup.
    if (pathname === '/topup/open') {
      const { topup, max } = await request.json()
      const refs = (await this.state.storage.get('topups')) ?? []
      const recent = await Promise.all(refs.slice(0, 20).map((r) => this.state.storage.get(`topup:${r}`)))
      const open = recent.filter((t) => t && isOpen(t) && topup.createdAt - t.createdAt < OPEN_WINDOW).length
      if (open >= max) return Response.json({ ok: false, error: 'too_many_open', max }, { status: 429 })
      await this.state.storage.put(`topup:${topup.reference}`, topup)
      await this.state.storage.put('topups', [topup.reference, ...refs].slice(0, TOPUP_INDEX))
      await this.record(topupItem(topup))
      return Response.json({ ok: true })
    }
    // Mise à jour partielle, seulement si la recharge est encore dans l'un des statuts `from` (jamais après un paiement abouti).
    if (pathname === '/topup/patch') {
      const { reference, from, ...fields } = await request.json()
      const t = await this.state.storage.get(`topup:${reference}`)
      if (!t || !from.includes(t.status)) return Response.json({ ok: false, topup: t ?? null })
      const next = { ...t, ...fields, updatedAt: Date.now() }
      await this.state.storage.put(`topup:${reference}`, next)
      await this.record(topupItem(next))
      return Response.json({ ok: true, topup: next })
    }

    const w = await this.wallet()
    if (pathname === '/balance') return Response.json({ balance: w.balance })
    // État d'un paiement paygate (webhook ou lecture) : mise à jour de la recharge et crédit dans la même requête, donc sans croisement.
    // Le crédit est idempotent par référence : un webhook rejoué ou une lecture après le webhook ne crédite pas deux fois.
    if (pathname === '/topup/apply') {
      const { reference, payment, late } = await request.json()
      const t = await this.state.storage.get(`topup:${reference}`)
      if (!t) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
      const out = applyPayment(t, payment, { late })
      let credited = 0
      const items = []
      if (out.credit > 0) {
        const r = credit(w, { paymentId: reference, amount: out.credit })
        if (r.ok && !r.replay) { await this.state.storage.put('wallet', w); credited = out.credit; items.push(ledgerItem('credit', reference, out.credit, w.balance)) }
      }
      if (out.topup !== t) { await this.state.storage.put(`topup:${reference}`, out.topup); items.push(topupItem(out.topup)) }
      if (items.length) await this.record(...items)
      return Response.json({ ok: true, topup: out.topup, credited, mismatch: out.mismatch ?? false, balance: w.balance })
    }
    const body = await request.json()
    const run = { '/debit': debit, '/refund': refund, '/credit': credit }[pathname]
    if (!run) return new Response('not found', { status: 404 })
    const result = run(w, body)
    if (result.ok && !result.replay) {
      await this.state.storage.put('wallet', w)
      const kind = pathname.slice(1)
      await this.record(ledgerItem(kind, body.jobId ?? body.paymentId, kind === 'refund' ? result.refunded : body.amount, w.balance))
    }
    return Response.json(result, { status: result.ok ? 200 : 402 })
  }
}
