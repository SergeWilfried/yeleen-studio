import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PACKS, findPack, toE164 } from '../src/packs.js'

test('packs : identifiants uniques, montants entiers en FCFA (paygate : au moins 100)', () => {
  assert.equal(new Set(PACKS.map((p) => p.id)).size, PACKS.length)
  for (const p of PACKS) assert.ok(Number.isInteger(p.fcfa) && p.fcfa >= 100 && p.jetons > 0, p.id)
  assert.equal(findPack('inconnu'), null)
})

test('toE164 : formats courants, pays inconnu ou mauvaise longueur refusés', () => {
  assert.equal(toE164('70 12 34 56', 'BF'), '+22670123456')
  assert.equal(toE164('+226 70-12-34-56', 'BF'), '+22670123456')
  assert.equal(toE164('0022670123456', 'BF'), '+22670123456')
  assert.equal(toE164('07 00 00 00 01', 'CI'), '+2250700000001')
  assert.equal(toE164('7012345', 'BF'), null)
  assert.equal(toE164('+2250700000001', 'BF'), null)
  assert.equal(toE164('70123456', 'XX'), null)
})
