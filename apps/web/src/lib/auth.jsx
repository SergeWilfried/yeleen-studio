import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ClerkProvider, SignIn, SignUp, UserButton, useAuth } from '@clerk/clerk-react'
import { frFR } from '@clerk/localizations'
import { setTokenGetter } from './api.js'

/**
 * Connexion avec Clerk. Sans `VITE_CLERK_PUBLISHABLE_KEY` (développement local), il n'y a pas de garde : l'API locale
 * (ENV=dev sans CLERK_ISSUER) sert alors un compte de démonstration unique. Avec la clé, les écrans de création exigent une
 * session, et chaque appel à l'API porte le jeton de session (l'API vérifie la signature : la garde réelle est côté serveur).
 */
const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
export const authEnabled = Boolean(KEY)

const Ctx = createContext({ enabled: false, ready: true, signedIn: true })
/** { enabled, ready, signedIn } : sans Clerk, tout le monde est « connecté » (compte de démonstration). */
export const useAuthState = () => useContext(Ctx)

const appearance = {
  variables: { colorPrimary: '#d6ff3f', colorTextOnPrimaryBackground: '#111111', colorBackground: '#16171a', colorText: '#ecece8', colorInputBackground: '#0d0e10', colorInputText: '#ecece8', borderRadius: '12px' },
}

/**
 * Bibliothèque, marque et fichiers importés vivent dans le navigateur : sur un ordinateur partagé, le suivant ne doit pas les voir.
 * À la déconnexion, ou quand le compte change, on efface ces données locales puis on recharge.
 */
function wipeLocal() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('studio.') && !k.startsWith('studio.cinema.promo')).forEach((k) => localStorage.removeItem(k)) } catch { /* ignoré */ }
  try { indexedDB.deleteDatabase('studio-assets') } catch { /* ignoré */ }
}

/** Donne à l'API le moyen d'obtenir un jeton frais, et publie l'état de la connexion. */
function Bridge({ children }) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth()
  const last = useRef(undefined) // dernier compte vu : undefined tant que Clerk n'a pas répondu
  useEffect(() => {
    if (!isLoaded) return
    if (last.current && last.current !== userId) { wipeLocal(); location.replace('/'); return }
    last.current = userId ?? null
  }, [isLoaded, userId])
  useEffect(() => {
    setTokenGetter(isSignedIn ? () => getToken() : null)
    return () => setTokenGetter(null)
  }, [isSignedIn, getToken])
  const value = useMemo(() => ({ enabled: true, ready: isLoaded, signedIn: Boolean(isSignedIn) }), [isLoaded, isSignedIn])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  if (!authEnabled) return children
  return (
    <ClerkProvider
      publishableKey={KEY}
      localization={frFR}
      appearance={appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  )
}

/** Réserve un écran aux utilisateurs connectés ; sinon, page de connexion puis retour ici. */
export function Protected({ children }) {
  const { enabled, ready, signedIn } = useAuthState()
  const { pathname, search } = useLocation()
  if (!enabled || signedIn) return children
  if (!ready) return <div className="route-fallback" />
  return <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`} replace />
}

const center = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 16 }
export const SignInPage = () => <main style={center}>{authEnabled ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /> : <Navigate to="/" replace />}</main>
export const SignUpPage = () => <main style={center}>{authEnabled ? <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /> : <Navigate to="/" replace />}</main>

/** Menu du compte (déconnexion…), ou l'avatar de démonstration sans Clerk. */
export function AccountMenu({ fallback = null }) {
  const { enabled, signedIn } = useAuthState()
  return enabled && signedIn ? <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} /> : fallback
}
