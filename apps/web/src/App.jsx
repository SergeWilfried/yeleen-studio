import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import { JobsProvider } from './lib/jobs.jsx'
import { AssetsProvider } from './lib/assets.jsx'
import { CatalogProvider } from './lib/catalog.jsx'
import { ChainsProvider } from './lib/chains.jsx'
import { HandoffProvider } from './lib/handoff.jsx'
import { LibraryDialogProvider } from './lib/libraryDialog.jsx'
import { RechargeDialogProvider, RechargeRoute } from './lib/rechargeDialog.jsx'
import { SpotsProvider } from './lib/spots.jsx'
import { BrandProvider } from './lib/brand.jsx'
import { ToastProvider } from './lib/toasts.jsx'
import { Protected, SignInPage, SignUpPage } from './lib/auth.jsx'
import { features } from './lib/features.js'
// Écrans éteints par drapeau (lib/features.js) : on revient au studio Cinéma. Les écrans d'outils sont chargés à la demande : l'accueil n'embarque pas leur code.
const Video = lazy(() => import('./pages/Video.jsx'))
const ImageGen = lazy(() => import('./pages/ImageGen.jsx'))
const Audio = lazy(() => import('./pages/Audio.jsx'))
const Spot = lazy(() => import('./pages/Spot.jsx'))
const Brand = lazy(() => import('./pages/Brand.jsx'))
const Cinema = lazy(() => import('./pages/Cinema.jsx'))

// Les liens `href="#"` sont des emplacements : ils ne doivent pas ramener la page en haut.
function useDeadLinkGuard() {
  useEffect(() => {
    const onClick = (e) => { if (e.target.closest?.('a[href="#"]')) e.preventDefault() }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}

export default function App() {
  useDeadLinkGuard()
  return (
    <ToastProvider>
    <JobsProvider>
    <AssetsProvider>
    <CatalogProvider>
    <BrandProvider>
    <ChainsProvider>
    <SpotsProvider>
    <HandoffProvider>
    <LibraryDialogProvider>
    <RechargeDialogProvider>
    <Suspense fallback={<div className="route-fallback" />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/video" element={features.video ? <Protected><Video /></Protected> : <Navigate to="/cinema" replace />} />
      <Route path="/image" element={features.image ? <Protected><ImageGen /></Protected> : <Navigate to="/cinema" replace />} />
      <Route path="/audio" element={features.audio ? <Protected><Audio /></Protected> : <Navigate to="/cinema" replace />} />
      <Route path="/spot" element={features.spot ? <Protected><Spot /></Protected> : <Navigate to="/cinema" replace />} />
      <Route path="/brand" element={features.brand ? <Protected><Brand /></Protected> : <Navigate to="/cinema" replace />} />
      <Route path="/cinema" element={<Protected><Cinema /></Protected>} />
      <Route path="/recharge/*" element={<Protected><RechargeRoute /></Protected>} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
    </Suspense>
    </RechargeDialogProvider>
    </LibraryDialogProvider>
    </HandoffProvider>
    </SpotsProvider>
    </ChainsProvider>
    </BrandProvider>
    </CatalogProvider>
    </AssetsProvider>
    </JobsProvider>
    </ToastProvider>
  )
}
