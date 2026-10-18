import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeatures } from '../src/lib/features.js'

test('par défaut, tout est éteint (MVP : studio Cinéma)', () => {
  for (const v of [undefined, '', '  ', ',']) assert.deepEqual(Object.values(parseFeatures(v)), [false, false, false, false, false])
})

test('on allume des écrans par nom, sans tenir compte de la casse ni des espaces', () => {
  const f = parseFeatures(' Image , VIDEO ')
  assert.equal(f.image, true)
  assert.equal(f.video, true)
  assert.equal(f.audio, false)
  assert.equal(f.spot, false)
  assert.equal(f.brand, false)
})

test('« all » allume tout ; un nom inconnu ne fait rien', () => {
  assert.deepEqual(Object.values(parseFeatures('all')), [true, true, true, true, true])
  assert.deepEqual(Object.values(parseFeatures('inconnu')), [false, false, false, false, false])
})
