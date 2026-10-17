/**
 * Règles du portefeuille de jetons, sans dépendance à Cloudflare : testables seules, puis exécutées
 * dans un Durable Object (voir wallet-do.js), où chaque compte a un seul écrivain.
 *
 * L'état est un objet simple { balance, ops } sérialisable. Chaque opération porte une clé d'idempotence
 * (identifiant de génération ou de paiement) : rejouée, elle ne change rien. Un remboursement ne dépasse
 * jamais le débit d'origine et ne se fait qu'une fois.
 */
const round = (n) => Math.round(n * 10) / 10

export const emptyWallet = () => ({ balance: 0, ops: {} })

export function debit(w, { jobId, amount }) {
  const key = `debit:${jobId}`
  if (w.ops[key]) return { ok: true, replay: true, balance: w.balance }
  if (!(amount > 0)) return { ok: false, error: 'invalid_amount' }
  if (w.balance < amount) return { ok: false, error: 'insufficient', missing: round(amount - w.balance), balance: w.balance }
  w.balance = round(w.balance - amount)
  w.ops[key] = { amount, at: Date.now() }
  return { ok: true, balance: w.balance }
}

export function refund(w, { jobId, amount }) {
  const spent = w.ops[`debit:${jobId}`]
  const key = `refund:${jobId}`
  if (!spent) return { ok: false, error: 'unknown_job' }
  if (w.ops[key]) return { ok: true, replay: true, balance: w.balance }
  const back = round(Math.min(amount ?? spent.amount, spent.amount))
  w.balance = round(w.balance + back)
  w.ops[key] = { amount: back, at: Date.now() }
  return { ok: true, refunded: back, balance: w.balance }
}

export function credit(w, { paymentId, amount }) {
  const key = `credit:${paymentId}`
  if (w.ops[key]) return { ok: true, replay: true, balance: w.balance }
  if (!(amount > 0)) return { ok: false, error: 'invalid_amount' }
  w.balance = round(w.balance + amount)
  w.ops[key] = { amount, at: Date.now() }
  return { ok: true, balance: w.balance }
}
