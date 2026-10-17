import { credit, debit, emptyWallet, refund } from './wallet.js'

const DEV_SEED = 240 // jetons offerts à un compte neuf, en développement seulement

/**
 * Durable Object : un compte = un portefeuille + ses générations. Les requêtes d'un même compte passent l'une
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

    const w = await this.wallet()
    if (pathname === '/balance') return Response.json({ balance: w.balance })
    const body = await request.json()
    const run = { '/debit': debit, '/refund': refund, '/credit': credit }[pathname]
    if (!run) return new Response('not found', { status: 404 })
    const result = run(w, body)
    if (result.ok && !result.replay) await this.state.storage.put('wallet', w)
    return Response.json(result, { status: result.ok ? 200 : 402 })
  }
}
