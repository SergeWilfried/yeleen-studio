import { test } from 'node:test'
import assert from 'node:assert/strict'
import { credit, debit, emptyWallet, refund } from '../src/wallet.js'

const funded = (n) => { const w = emptyWallet(); credit(w, { paymentId: 'p0', amount: n }); return w }

test('un débit insuffisant renvoie le manque, sans toucher au solde', () => {
  const w = funded(5)
  const r = debit(w, { jobId: 'j1', amount: 8.5 })
  assert.deepEqual([r.ok, r.error, r.missing], [false, 'insufficient', 3.5])
  assert.equal(w.balance, 5)
})

test('rejouer un débit ne débite pas deux fois', () => {
  const w = funded(10)
  debit(w, { jobId: 'j1', amount: 4 })
  const again = debit(w, { jobId: 'j1', amount: 4 })
  assert.equal(again.replay, true)
  assert.equal(w.balance, 6)
})

test('un remboursement se fait une fois et ne dépasse pas le débit', () => {
  const w = funded(10)
  debit(w, { jobId: 'j1', amount: 4 })
  assert.equal(refund(w, { jobId: 'j1', amount: 99 }).refunded, 4)
  assert.equal(refund(w, { jobId: 'j1' }).replay, true)
  assert.equal(w.balance, 10)
})

test('on ne rembourse pas une génération inconnue', () => {
  assert.equal(refund(funded(10), { jobId: 'x' }).error, 'unknown_job')
})

test('un paiement rejoué ne crédite pas deux fois', () => {
  const w = emptyWallet()
  credit(w, { paymentId: 'pay-1', amount: 30 })
  credit(w, { paymentId: 'pay-1', amount: 30 })
  assert.equal(w.balance, 30)
})
