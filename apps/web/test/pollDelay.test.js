import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueJobs, pollDelay } from '../src/lib/pollDelay.js'

test('le délai grandit avec l’âge de la génération et ralentit onglet masqué', () => {
  assert.equal(pollDelay(0), 2000)
  assert.equal(pollDelay(30_000), 4000)
  assert.equal(pollDelay(120_000), 8000)
  assert.equal(pollDelay(600_000), 15000)
  assert.equal(pollDelay(0, true), 30000)
})

test('seules les générations dont le délai est écoulé sont interrogées', () => {
  const now = 1_000_000
  const jobs = [{ id: 'a', createdAt: now - 5_000 }, { id: 'b', createdAt: now - 400_000 }, { id: 'c', createdAt: now - 5_000 }]
  const last = new Map([['a', now - 1_000], ['b', now - 10_000], ['c', now - 2_500]])
  assert.deepEqual(dueJobs(jobs, last, now).map((j) => j.id), ['c']) // a : 1 s < 2 s ; b : 10 s < 15 s ; c : 2,5 s ≥ 2 s
  assert.deepEqual(dueJobs(jobs, new Map(), now).map((j) => j.id), ['a', 'b', 'c'])
  assert.deepEqual(dueJobs(jobs, last, now, true), [])
})
