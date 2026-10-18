import Icon from '../lib/icons.jsx'
import Menu from './Menu.jsx'
import { useAssets } from '../lib/assets.jsx'
import { useHandoff } from '../lib/handoff.jsx'
import { useLibrary } from '../lib/libraryDialog.jsx'
import { useToast } from '../lib/toasts.jsx'
import { useBrand } from '../lib/brand.jsx'
import { features } from '../lib/features.js'
import { useNavigate } from 'react-router-dom'

/** Télécharge le fichier d'un asset. */
export async function downloadAsset(assets, asset) {
  const file = await assets.getFile(asset)
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Les actions « Envoyer vers » d'un asset, selon son type. Chaque action dit ce qu'elle remplit (titre)
 * et où elle mène (aside) ; la destination reprend l'asset et choisit un modèle compatible si besoin.
 */
export function useSendActions(asset, { withLibrary = false } = {}) {
  const { sendTo } = useHandoff()
  const assets = useAssets()
  const navigate = useNavigate()
  const toast = useToast()
  const { patch: patchBrand } = useBrand()
  const { openLibrary } = useLibrary()
  const to = (spec, msg) => () => sendTo({ ...spec, assetId: asset.id }, msg)
  const list = []
  if (asset.kind === 'image') {
    list.push(
      { id: 'start', icon: 'img', title: 'Image de départ', aside: 'Vidéo · Créer', run: to({ target: 'video.create', slot: 'start' }, 'Image envoyée vers Vidéo · Créer') },
      { id: 'end', icon: 'img', title: 'Image de fin', aside: 'Vidéo · Créer', run: to({ target: 'video.create', slot: 'end' }, 'Image envoyée vers Vidéo · Créer') },
      { id: 'weather', icon: 'vid', title: 'Changer la météo (Weather)', aside: 'Cinéma · Modèles', run: to({ target: 'cinema.recipe', recipeId: 'wf-weather' }) },
      { id: 'fancam', icon: 'vid', title: 'Faire ma fan-cam', aside: 'Cinéma · Modèles', run: to({ target: 'cinema.recipe', recipeId: 'wf-fan-cam' }) },
      { id: 'hug', icon: 'vid', title: 'Photo to Video (1re personne)', aside: 'Cinéma · Modèles', run: to({ target: 'cinema.recipe', recipeId: 'wf-photo-to-video' }) },
      { id: 'logo', icon: 'palette', title: 'Logo de la marque', aside: 'Marque', run: () => { patchBrand({ logoId: asset.id }); toast('Logo de la marque mis à jour'); navigate('/brand') } },
    )
  } else if (asset.kind === 'video') {
    list.push(
      { id: 'extend', icon: 'extend', title: 'Prolonger la vidéo', aside: 'Vidéo · Modifier', run: to({ target: 'video.edit', tool: 'extend' }, 'Vidéo envoyée vers Modifier · Prolonger') },
      { id: 'edit', icon: 'wand', title: 'Modifier la vidéo', aside: 'Vidéo · Modifier', run: to({ target: 'video.edit', tool: 'edit' }, 'Vidéo envoyée vers Modifier') },
      { id: 'last', icon: 'img', title: 'Dernière image → départ', aside: 'Vidéo · Créer', run: to({ target: 'video.create', slot: 'start', frame: 'last' }, 'Dernière image envoyée vers Vidéo · Créer') },
      { id: 'first', icon: 'img', title: 'Première image → fin', aside: 'Vidéo · Créer', run: to({ target: 'video.create', slot: 'end', frame: 'first' }, 'Première image envoyée vers Vidéo · Créer') },
    )
  } else {
    list.push(
      { id: 'audio', icon: 'sound', title: 'Piste audio', aside: 'Vidéo · Audio → vidéo', run: to({ target: 'video.create', slot: 'audio', modelId: 'ltx-2-3-a2v' }, 'Audio envoyé vers Vidéo · Audio → vidéo') },
    )
  }
  if (withLibrary) list.push({ id: 'lib', icon: 'folder', title: 'Voir dans la bibliothèque', aside: 'Bibliothèque', run: () => openLibrary({ focus: asset.id }) })
  list.push({ id: 'dl', icon: 'download', title: 'Télécharger', run: () => downloadAsset(assets, asset).catch(() => toast('Téléchargement impossible : fichier introuvable.')) })
  // Destinations éteintes par drapeau : Vidéo (créer, modifier) et Marque.
  const hidden = new Set([...(features.video ? [] : ['start', 'end', 'extend', 'edit', 'last', 'first', 'audio']), ...(features.brand ? [] : ['logo'])])
  return list.filter((a) => !hidden.has(a.id))
}

/** Bouton « Envoyer vers » (menu), pour les cartes de génération et les vignettes. */
export default function SendToMenu({ asset, iconOnly = false, className = '', icon = 'send', title }) {
  const actions = useSendActions(asset, { withLibrary: true })
  const items = actions.map(({ id, icon, title, aside }) => ({ id, icon, title, aside }))
  return (
    <Menu items={items} value={null} onChange={(id) => actions.find((a) => a.id === id).run()} label={title ?? `Envoyer vers : ${asset.name}`} menuWidth={330} className={`send ${iconOnly ? 'icon' : ''} ${className}`} heading="Envoyer vers">
      <Icon name={icon} size={17} />{!iconOnly && <span>Envoyer vers</span>}
    </Menu>
  )
}
