import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest, ffmpegCommand, estimate, writeScript, validateBrief, srtOf } from '../src/spot.js'

const brief = { name: 'Maman Awa', offer: 'des beignets frais tous les matins', price: '', whatsapp: '+226 70 12 34 56', tone: 'warm', lang: 'fr', voice: 'Rachel' }

test('le script tient en trois lignes et le brief valide passe', () => {
  const lines = writeScript(brief)
  assert.equal(lines.length, 3)
  assert.deepEqual(validateBrief(brief, lines), {})
})

test('une photo fournie retire le coût du visuel', () => {
  const lines = writeScript(brief)
  const sans = estimate(lines, false)
  const avec = estimate(lines, true)
  assert.ok(sans.total > avec.total)
  assert.ok(!avec.parts.some((p) => p.id === 'image'))
})

test('le manifeste et la commande ffmpeg portent la durée et la carte finale', () => {
  const lines = writeScript(brief)
  const { secs } = estimate(lines, true)
  const m = buildManifest({ brief, lines, secs, video: { seed: 1, art: {} }, voice: { seed: 2, secs: 8 }, brand: null })
  assert.equal(m.duration, secs)
  assert.equal(m.endCard.whatsapp, '22670123456')
  assert.match(ffmpegCommand(m), new RegExp(`-t ${secs} `))
  assert.match(srtOf(m.captions), /-->/)
})
