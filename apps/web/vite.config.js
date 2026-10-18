import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  if (mode === 'production') checkAuthKey(loadEnv(mode, process.cwd(), 'VITE_'))
  return { plugins: [react()] }
})

/**
 * Sans clé publique Clerk, le site se construit sans connexion : la garde disparaît en silence. En production (intégration continue,
 * Cloudflare), ce n'est jamais voulu : la construction échoue avec la marche à suivre. VITE_ALLOW_NO_AUTH=1 pour passer outre.
 * En local, on prévient seulement.
 */
function checkAuthKey(fileEnv) {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? fileEnv.VITE_CLERK_PUBLISHABLE_KEY ?? ''
  if (key && !/^pk_(test|live)_/.test(key)) throw new Error('VITE_CLERK_PUBLISHABLE_KEY doit être la clé PUBLIQUE de Clerk (pk_test_… ou pk_live_…), jamais la clé secrète (sk_…).')
  if (key) return
  if (process.env.VITE_ALLOW_NO_AUTH === '1') return console.warn('\n⚠ Construction sans connexion Clerk (VITE_ALLOW_NO_AUTH=1) : les écrans ne sont pas protégés.\n')
  const message = 'VITE_CLERK_PUBLISHABLE_KEY est absente : le site serait construit SANS connexion (aucune garde).\n' +
    '  → Cloudflare : projet → Paramètres → Build → « Variables et secrets », ajoutez VITE_CLERK_PUBLISHABLE_KEY (clé publique pk_…) comme variable de BUILD\n' +
    '    (pas comme variable d\'exécution du Worker, qui n\'est pas visible à la construction), puis relancez le déploiement.\n' +
    '  → Local : VITE_CLERK_PUBLISHABLE_KEY=pk_… pnpm build.  Volontairement sans connexion : VITE_ALLOW_NO_AUTH=1.'
  if (process.env.CI || process.env.WORKERS_CI || process.env.CF_PAGES) throw new Error(`\n${message}\n`)
  console.warn(`\n⚠ ${message}\n`)
}
