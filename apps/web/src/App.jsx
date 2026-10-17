import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import { JobsProvider } from './lib/jobs.jsx'
import { AssetsProvider } from './lib/assets.jsx'
import { ChainsProvider } from './lib/chains.jsx'
import { HandoffProvider } from './lib/handoff.jsx'
import { SpotsProvider } from './lib/spots.jsx'
import { BrandProvider } from './lib/brand.jsx'
import { ToastProvider } from './lib/toasts.jsx'
// Les écrans d'outils sont chargés à la demande : l'accueil n'embarque pas leur code.
const Video = lazy(() => import('./pages/Video.jsx'))
const ImageGen = lazy(() => import('./pages/ImageGen.jsx'))
const Audio = lazy(() => import('./pages/Audio.jsx'))
const Library = lazy(() => import('./pages/Library.jsx'))
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
    <BrandProvider>
    <ChainsProvider>
    <SpotsProvider>
    <HandoffProvider>
    <Suspense fallback={<div className="route-fallback" />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/video" element={<Video />} />
      <Route path="/image" element={<ImageGen />} />
      <Route path="/audio" element={<Audio />} />
      <Route path="/library" element={<Library />} />
      <Route path="/spot" element={<Spot />} />
      <Route path="/brand" element={<Brand />} />
      <Route path="/cinema" element={<Cinema />} />
      <Route path="*" element={<Home />} />
    </Routes>
    </Suspense>
    </HandoffProvider>
    </SpotsProvider>
    </ChainsProvider>
    </BrandProvider>
    </AssetsProvider>
    </JobsProvider>
    </ToastProvider>
  )
}
