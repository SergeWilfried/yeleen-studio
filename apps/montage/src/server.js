import { createServer } from 'node:http'
import { planMontage } from './plan.js'

/**
 * Gabarit du worker. Reçoit un plan de montage (POST /jobs), le valide et renvoie la commande prévue.
 * TODO : télécharger les entrées depuis R2, exécuter ffmpeg (child_process), téléverser spot.mp4, rappeler l'API.
 * Authentification : à protéger par un secret partagé avec l'API avant toute mise en ligne.
 */
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true })
  if (req.method === 'POST' && req.url === '/jobs') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let manifest
    try { manifest = JSON.parse(raw) } catch { return send(res, 400, { error: 'JSON invalide' }) }
    const plan = planMontage(manifest)
    return send(res, plan.ok ? 202 : 422, plan)
  }
  send(res, 404, { error: 'not found' })
}).listen(process.env.PORT ?? 8080)
