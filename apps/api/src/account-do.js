import { applyPayment, isOpen } from './topups.js'
import { credit, debit, emptyWallet, refund } from './wallet.js'

const DEV_SEED = 240 // jetons offerts à un compte neuf, en développement seulement
const TOPUP_INDEX = 200 // recharges gardées dans l'historique du compte
const OPEN_WINDOW = 20 * 60_000 // une recharge ouverte depuis plus longtemps ne compte plus dans la limite

/**
 * Durable Object : un compte = un portefeuille + ses générations + ses recharges. Les requêtes d'un même compte passent l'une
 * après l'autre, donc un débit et son remboursement ne peuvent pas se croiser.
 */
export class Account {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async wallet() {
    let w = await this.state.storage.get('wallet')
    if (!w) {
      w = emptyWallet()
      if (this.env.ENV === 'dev') credit(w, { paymentId: 'dev-seed', amount: DEV_SEED })
      await this.state.storage.put('wallet', w)
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

    if (pathname === '/job/get') return Response.json((await this.state.storage.get(`job:${url.searchParams.get('id')}`)) ?? null)
    if (pathname === '/job/put') {
      const job = await request.json()
      await this.state.storage.put(`job:${job.id}`, job)
      await this.track(job.id, job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS') // une génération terminée libère sa place
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
      return Response.json({ ok: true })
    }
    // Mise à jour partielle, seulement si la recharge est encore dans l'un des statuts `from` (jamais après un paiement abouti).
    if (pathname === '/topup/patch') {
      const { reference, from, ...fields } = await request.json()
      const t = await this.state.storage.get(`topup:${reference}`)
      if (!t || !from.includes(t.status)) return Response.json({ ok: false, topup: t ?? null })
      const next = { ...t, ...fields, updatedAt: Date.now() }
      await this.state.storage.put(`topup:${reference}`, next)
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
      if (out.credit > 0) {
        const r = credit(w, { paymentId: reference, amount: out.credit })
        if (r.ok && !r.replay) { await this.state.storage.put('wallet', w); credited = out.credit }
      }
      if (out.topup !== t) await this.state.storage.put(`topup:${reference}`, out.topup)
      return Response.json({ ok: true, topup: out.topup, credited, mismatch: out.mismatch ?? false, balance: w.balance })
    }
    const body = await request.json()
    const run = { '/debit': debit, '/refund': refund, '/credit': credit }[pathname]
    if (!run) return new Response('not found', { status: 404 })
    const result = run(w, body)
    if (result.ok && !result.replay) await this.state.storage.put('wallet', w)
    return Response.json(result, { status: result.ok ? 200 : 402 })
  }
}
