import { test } from 'node:test'
import assert from 'node:assert/strict'
import { favoriteSets, fromRemote, mergeRemote, remoteAssetId } from '../src/lib/librarySync.js'

const NOW = 1_800_000_000_000
const server = (id, at, extra = {}) => ({ id, kind: 'image', source: 'generated', name: `fichier ${id}`, url: `https://api/files/outputs/u/${id}.png`, contentType: 'image/png', createdAt: at, index: 0, jobId: id.split(':')[0], ...extra })

test('remoteAssetId : seulement pour une sortie gardée par l’API', () => {
  assert.equal(remoteAssetId('job1', 2, { stored: true }), 'job1:2')
  assert.equal(remoteAssetId('job1', 2, { stored: false }), null)
  assert.equal(remoteAssetId(null, 0, { stored: true }), null)
})

test('fusion : une génération suivie dans l’onglet n’est pas doublée et prend l’adresse durable', () => {
  const local = [{ id: 'k1-0', remoteId: 'job1:0', url: 'https://fal/tmp.png', createdAt: NOW - 1000, starred: false, origin: { jobKey: 'k1' } }]
  const { list } = mergeRemote(local, [server('job1:0', NOW - 1000)], new Set(), { now: NOW })
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'k1-0') // l'entrée locale reste (origine dans l'onglet)
  assert.equal(list[0].url, 'https://api/files/outputs/u/job1:0.png')
})

test('fusion : les fichiers d’un autre appareil arrivent, triés du plus récent au plus ancien', () => {
  const local = [{ id: 'up-1', source: 'upload', createdAt: NOW - 500 }]
  const { list } = mergeRemote(local, [server('a:0', NOW - 2000), server('b:0', NOW - 100)], new Set(['a:0']), { now: NOW })
  assert.deepEqual(list.map((a) => a.id), ['b:0', 'up-1', 'a:0'])
  assert.equal(list.find((a) => a.id === 'a:0').starred, true)
  assert.deepEqual(fromRemote(server('a:0', 1)).remoteId, 'a:0')
})

test('fusion : une étoile locale que le serveur ignore lui est envoyée ; une étoile du serveur s’applique', () => {
  const local = [
    { id: 'k1-0', remoteId: 'job1:0', createdAt: NOW, starred: true },
    { id: 'k2-0', remoteId: 'job2:0', createdAt: NOW, starred: false },
  ]
  const { list, push } = mergeRemote(local, [server('job1:0', NOW), server('job2:0', NOW)], new Set(['job2:0']), { now: NOW })
  assert.deepEqual(push, ['job1:0'])
  assert.ok(list.every((a) => a.starred))
})

test('fusion : supprimé ailleurs → retiré, sauf entrée récente ou liste du serveur incomplète', () => {
  const old = { id: 'k1-0', remoteId: 'job1:0', createdAt: NOW - 3600_000 }
  const fresh = { id: 'k2-0', remoteId: 'job2:0', createdAt: NOW - 60_000 }
  const plain = { id: 'up-1', source: 'upload', createdAt: NOW - 3600_000 }
  assert.deepEqual(mergeRemote([old, fresh, plain], [], new Set(), { now: NOW }).list.map((a) => a.id), ['k2-0', 'up-1'])
  assert.equal(mergeRemote([old], [], new Set(), { now: NOW, complete: false }).list.length, 1)
})

test('favoriteSets : par portée, portée inconnue ignorée', () => {
  const s = favoriteSets([{ scope: 'mine', id: 'a:0' }, { scope: 'yeleen', id: 'perso-1' }, { scope: 'autre', id: 'x' }])
  assert.deepEqual([...s.mine], ['a:0'])
  assert.deepEqual([...s.yeleen], ['perso-1'])
})
