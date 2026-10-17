import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest, estimate, writeScript } from '@studio/spot'
import { planMontage, validateManifest } from '../src/plan.js'

const brief = { name: 'Maman Awa', offer: 'des beignets frais', price: '', whatsapp: '+226 70 12 34 56', tone: 'warm', lang: 'fr', voice: 'Rachel' }
const manifest = () => {
  const lines = writeScript(brief)
  const { secs } = estimate(lines, true)
  return buildManifest({ brief, lines, secs, video: { seed: 1, art: {} }, voice: { seed: 2, secs: 8 }, brand: null })
}

test('un plan complet donne les fichiers et la commande', () => {
  const p = planMontage(manifest())
  assert.equal(p.ok, true)
  assert.match(p.command, /^ffmpeg /)
  assert.ok(p.files['captions.srt'].includes('-->'))
})

test('un plan incomplet ou trop long est refusé', () => {
  assert.equal(validateManifest({}).ok, false)
  assert.equal(validateManifest({ ...manifest(), duration: 600 }).ok, false)
})
