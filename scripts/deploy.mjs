#!/usr/bin/env node
/**
 * Déploiement Cloudflare : l'API (Worker + Durable Object + R2) puis l'application web (fichiers statiques).
 *
 *   node scripts/deploy.mjs check              vérifie l'environnement (outils, connexion Cloudflare, tests)
 *   node scripts/deploy.mjs api                crée le bucket R2 si besoin, vérifie le secret FAL_KEY, déploie l'API
 *   node scripts/deploy.mjs web                construit le site avec l'adresse de l'API et le déploie
 *   node scripts/deploy.mjs all                api, puis web, puis autorise l'adresse du site dans l'API (CORS) et vérifie
 *
 * Options : --dry-run (construit et valide, ne change rien chez Cloudflare), --yes (sans confirmation), --skip-tests,
 *           --api-url=URL, --web-origin=URL (sinon variables API_URL / WEB_ORIGIN, sinon dernières adresses connues).
 * Connexion des utilisateurs (Clerk) : CLERK_ISSUER (adresse de l'instance, ex. https://xxx.clerk.accounts.dev) pour l'API et
 *           VITE_CLERK_PUBLISHABLE_KEY (pk_…) pour le site, dans l'environnement ; `check` refuse un déploiement sans eux (sauf --no-auth).
 * Premier déploiement : CLERK_ISSUER=… VITE_CLERK_PUBLISHABLE_KEY=… FAL_KEY=… node scripts/deploy.mjs all   (la clé n'est lue que de l'environnement, jamais affichée).
 * Connexion : `pnpm exec wrangler login`, ou CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID pour l'intégration continue.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API_CONFIG = 'apps/api/wrangler.toml'
const WEB_CONFIG = 'wrangler.jsonc'
const BUCKET = 'studio-files'
const STATE = join(ROOT, '.deploy-state.json') // dernières adresses déployées (ignoré par git)

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'help'
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const dry = flag('dry-run')
const needAuth = !flag('no-auth')

const say = (m) => console.log(m)
const step = (m) => console.log(`\n▸ ${m}`)
const ok = (m) => console.log(`  ✓ ${m}`)
const warn = (m) => console.log(`  ! ${m}`)
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1) }

const readState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return {} } }
const saveState = (patch) => writeFileSync(STATE, `${JSON.stringify({ ...readState(), ...patch }, null, 2)}\n`)

/** Lance une commande ; retourne { code, out }. Les secrets passent par `input` ou l'environnement, jamais par les arguments. */
function run(cmd, cmdArgs, { input, env, quiet = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, input, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (!quiet && r.status !== 0) process.stderr.write(out)
  return { code: r.status ?? 1, out }
}
const wrangler = (wArgs, o) => run('pnpm', ['exec', 'wrangler', ...wArgs], o)

async function confirm(question) {
  if (dry || flag('yes') || !process.stdin.isTTY) return
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = (await rl.question(`\n${question} [o/N] `)).trim().toLowerCase()
  rl.close()
  if (!['o', 'oui', 'y', 'yes'].includes(a)) fail('Annulé.')
}

const clerkIssuer = () => (process.env.CLERK_ISSUER ?? readState().clerkIssuer ?? '').replace(/\/+$/, '') || null
const normalize = (url) => (url ? url.replace(/\/+$/, '') : null)
const origins = () => [...new Set([opt('web-origin') ?? process.env.WEB_ORIGIN ?? readState().webOrigin].filter(Boolean).map(normalize))]
const apiUrl = () => normalize(opt('api-url') ?? process.env.API_URL ?? readState().apiUrl)
const urlIn = (out) => normalize(out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0])

// ── Vérifications ────────────────────────────────────────────────────────────

function check() {
  step('Vérification de l’environnement')
  const major = Number(process.versions.node.split('.')[0])
  if (major < 20) fail(`Node 20 ou plus est requis (version actuelle : ${process.versions.node}).`)
  ok(`Node ${process.versions.node}`)

  const v = wrangler(['--version'], { quiet: true })
  if (v.code !== 0) fail('wrangler est introuvable : lancez `pnpm install` à la racine.')
  ok(`wrangler ${v.out.trim().split('\n').pop()}`)

  if (process.env.CLOUDFLARE_API_TOKEN) ok('jeton Cloudflare fourni par l’environnement')
  else {
    const w = wrangler(['whoami'], { quiet: true })
    const logged = /logged in/i.test(w.out)
    if (!logged && !dry) fail('Pas connecté à Cloudflare : lancez `pnpm exec wrangler login` (ou définissez CLOUDFLARE_API_TOKEN).')
    logged ? ok('connecté à Cloudflare') : warn('non connecté à Cloudflare (suffisant pour une simulation)')
  }

  // Sans Clerk, l'API en production refuse tout (jamais de compte par défaut) et le site n'a pas de connexion : on s'en assure avant.
  const needsApi = ['api', 'all'].includes(command)
  const needsWeb = ['web', 'all'].includes(command)
  const issuer = process.env.CLERK_ISSUER ?? readState().clerkIssuer
  const pk = process.env.VITE_CLERK_PUBLISHABLE_KEY
  if (needAuth && needsApi && !issuer) (dry ? warn : fail)('CLERK_ISSUER manquant (adresse de votre instance Clerk, ex. https://xxx.clerk.accounts.dev). L\'API refuserait toutes les requêtes. (--no-auth pour passer outre.)')
  if (needAuth && needsWeb && !pk) (dry ? warn : fail)('VITE_CLERK_PUBLISHABLE_KEY manquante (clé publique pk_… de Clerk) : le site n\'aurait pas de connexion. (--no-auth pour passer outre.)')
  if (issuer && !/^https:\/\/[\w.-]+$/.test(issuer.replace(/\/+$/, ''))) fail('CLERK_ISSUER doit être une adresse https:// sans chemin.')
  if (pk && !/^pk_(test|live)_/.test(pk)) fail('VITE_CLERK_PUBLISHABLE_KEY doit commencer par pk_test_ ou pk_live_ (jamais la clé secrète sk_…).')
  if (issuer) ok('Clerk : instance ' + issuer.replace(/\/+$/, ''))
  if (!flag('skip-tests')) {
    const t = run('pnpm', ['test'], { quiet: true })
    if (t.code !== 0) { process.stderr.write(t.out); fail('Les tests échouent : rien n’est déployé.') }
    ok('tests réussis')
  } else warn('tests ignorés (--skip-tests)')
}

// ── API ──────────────────────────────────────────────────────────────────────

function ensureBucket() {
  if (dry && !process.env.CLOUDFLARE_API_TOKEN && !/logged in/i.test(wrangler(['whoami'], { quiet: true }).out)) return warn('bucket R2 non vérifié (non connecté)')
  const list = wrangler(['r2', 'bucket', 'list'], { quiet: true })
  if (list.code !== 0) { process.stderr.write(list.out); fail('Impossible de lister les buckets R2 (R2 est-il activé sur le compte ?).') }
  if (new RegExp(`name:\\s+${BUCKET}\\b`).test(list.out) || list.out.includes(BUCKET)) return ok(`bucket R2 « ${BUCKET} » présent`)
  if (dry) return warn(`bucket R2 « ${BUCKET} » absent : il serait créé`)
  const c = wrangler(['r2', 'bucket', 'create', BUCKET])
  if (c.code !== 0) fail('Création du bucket R2 impossible.')
  ok(`bucket R2 « ${BUCKET} » créé`)
}

function ensureSecret() {
  if (dry && !process.env.CLOUDFLARE_API_TOKEN && !/logged in/i.test(wrangler(['whoami'], { quiet: true }).out)) return warn('secret FAL_KEY non vérifié (non connecté)')
  const list = wrangler(['secret', 'list', '-c', API_CONFIG, '--format', 'json'], { quiet: true })
  const names = list.code === 0 ? (() => { try { return JSON.parse(list.out.slice(list.out.indexOf('['))).map((s) => s.name) } catch { return [] } })() : []
  const key = process.env.FAL_KEY
  if (names.includes('FAL_KEY') && !key) return ok('secret FAL_KEY déjà défini (pour le changer : FAL_KEY=… node scripts/deploy.mjs api)')
  if (!key) {
    if (dry) return warn('secret FAL_KEY absent : il faudra le fournir (FAL_KEY=… node scripts/deploy.mjs api)')
    fail('Le secret FAL_KEY n’existe pas encore. Relancez avec la clé dans l’environnement :  FAL_KEY=… node scripts/deploy.mjs api')
  }
  if (dry) return ok('secret FAL_KEY fourni : il serait enregistré')
  const put = wrangler(['secret', 'put', 'FAL_KEY', '-c', API_CONFIG], { input: key })
  if (put.code !== 0) fail('Enregistrement du secret FAL_KEY impossible.')
  ok('secret FAL_KEY enregistré')
}

function deployApi({ firstPass = true } = {}) {
  step(firstPass ? 'API (Worker, Durable Object, R2)' : 'API : autorisation du site (CORS)')
  if (firstPass) { ensureBucket(); ensureSecret() }
  const allowed = origins().join(',')
  if (!allowed) warn('adresse du site inconnue : ALLOWED_ORIGINS reste vide pour l’instant (corrigé automatiquement par « all »)')
  const d = wrangler(['deploy', '-c', API_CONFIG, ...(dry ? ['--dry-run'] : []), ...(allowed ? ['--var', `ALLOWED_ORIGINS:${allowed}`] : []), ...(clerkIssuer() ? ['--var', `CLERK_ISSUER:${clerkIssuer()}`] : [])])
  if (d.code !== 0) fail('Le déploiement de l’API a échoué.')
  const url = urlIn(d.out)
  if (dry) return ok('configuration de l’API valide (simulation)')
  if (!url) warn('adresse de l’API introuvable dans la sortie de wrangler : passez --api-url=… à la commande web')
  else { saveState({ apiUrl: url, apiOrigins: allowed, ...(clerkIssuer() ? { clerkIssuer: clerkIssuer() } : {}) }); ok(`API déployée : ${url}`) }
  return url
}

// ── Web ──────────────────────────────────────────────────────────────────────

function deployWeb() {
  step('Application web (fichiers statiques)')
  const api = apiUrl()
  if (!api) warn('adresse de l’API inconnue : le site utilisera le moteur de génération simulé (VITE_API_URL absente)')
  else ok(`le site appellera l’API : ${api}`)
  // `wrangler deploy` construit le site lui-même (champ « build » de wrangler.jsonc) : l'adresse de l'API doit donc lui être transmise aussi.
  const d = wrangler(['deploy', '-c', WEB_CONFIG, ...(dry ? ['--dry-run'] : [])], { env: { VITE_API_URL: api ?? '' } })
  if (d.code !== 0) fail('La construction ou le déploiement du site a échoué.')
  if (!existsSync(join(ROOT, 'apps/web/dist/index.html'))) fail('apps/web/dist est introuvable après la construction.')
  ok('site construit')
  if (dry) return ok('configuration du site valide (simulation)')
  const url = urlIn(d.out)
  if (url) { saveState({ webOrigin: url }); ok(`site déployé : ${url}`) } else warn('adresse du site introuvable dans la sortie de wrangler')
  return url
}

// ── Vérifications après déploiement ──────────────────────────────────────────

async function smoke(api, web) {
  step('Vérifications après déploiement')
  const get = (url, init) => fetch(url, { signal: AbortSignal.timeout(15_000), ...init })
  try {
    const h = await get(`${api}/health`)
    h.ok ? ok('API : /health répond') : warn(`API : /health renvoie ${h.status}`)
    if (web) {
      const c = await get(`${api}/wallet`, { method: 'OPTIONS', headers: { Origin: web, 'Access-Control-Request-Method': 'GET' } })
      c.headers.get('access-control-allow-origin') === web ? ok('API : le site est autorisé (CORS)') : warn('API : le site n’est pas autorisé (CORS) — vérifiez ALLOWED_ORIGINS')
      const p = await get(`${web}/cinema`)
      p.ok ? ok('site : /cinema répond (routes de l’application)') : warn(`site : /cinema renvoie ${p.status}`)
    }
  } catch (e) { warn(`vérification impossible : ${e.message} (un déploiement tout neuf met parfois une minute à répondre)`) }
}

// ── Commandes ────────────────────────────────────────────────────────────────

const HELP = `Usage : node scripts/deploy.mjs <check|api|web|all> [--dry-run] [--yes] [--skip-tests] [--api-url=URL] [--web-origin=URL]\nPremier déploiement : FAL_KEY=… node scripts/deploy.mjs all`

if (command === 'help') { say(HELP); process.exit(0) }
if (!['check', 'api', 'web', 'all'].includes(command)) fail(`Commande inconnue : ${command}\n${HELP}`)

check()
if (command !== 'check') {
  await confirm(`Déployer « ${command} » chez Cloudflare${origins().length ? ` (site : ${origins().join(', ')})` : ''} ?`)
  if (dry) say('\n(simulation : rien n’est modifié chez Cloudflare)')
  if (command === 'api') deployApi()
  if (command === 'web') deployWeb()
  if (command === 'all') {
    const before = origins().join(',')
    const api = deployApi()
    const web = deployWeb()
    // Le site n'existait peut-être pas encore au premier passage : on autorise maintenant son adresse dans l'API.
    if (!dry && web && !before.split(',').includes(web)) deployApi({ firstPass: false })
    if (!dry) await smoke(api ?? apiUrl(), web ?? origins()[0])
  }
  if (!dry && command === 'api') await smoke(apiUrl(), origins()[0])
}
say(`\n${dry ? 'Simulation terminée.' : 'Terminé.'}`)
