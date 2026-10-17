import { useEffect } from 'react'

const SITE = 'Studio Yeelen'

/** Titre de l'onglet propre à chaque écran (« Spot pub · Studio Yeelen »), pour s'y retrouver et pour les lecteurs d'écran. */
export default function useDocumentTitle(page) {
  useEffect(() => {
    document.title = page ? `${page} · ${SITE}` : SITE
  }, [page])
}
