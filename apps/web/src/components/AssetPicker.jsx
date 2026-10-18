import { useEffect, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import AssetThumb from './AssetThumb.jsx'
import { KINDS, useAssets } from '../lib/assets.jsx'
import { useToast } from '../lib/toasts.jsx'
import '../styles/library.css'

const ARTICLE = { image: 'une image', video: 'une vidéo', audio: 'un audio' }

/**
 * Feuille latérale pour choisir un asset de la bibliothèque (ou en importer un) et le placer dans une entrée.
 * Basée sur <dialog> : focus piégé, Échap pour fermer, rien à gérer à la main.
 */
export default function AssetPicker({ kind, open, onClose, onPick }) {
  const ref = useRef(null)
  const { assets, importMany, getFile } = useAssets()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    const d = ref.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Fermée, la feuille ne construit rien : une grande bibliothèque ne coûte rien tant qu'on ne l'ouvre pas.
  const list = !open ? [] : assets.filter((a) => a.kind === kind && (!q.trim() || `${a.name} ${a.prompt ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))

  const pick = async (asset) => {
    setBusy(asset.id)
    try {
      onPick(await getFile(asset), asset)
      onClose()
    } catch {
      toast('Fichier introuvable : réimportez-le.')
    } finally {
      setBusy(null)
    }
  }
  const importFiles = async (fl) => {
    const { added, errors } = await importMany(fl)
    errors.forEach((m) => toast(m))
    const ofKind = added.filter((a) => a.kind === kind)
    if (ofKind.length === 1) pick(ofKind[0])
  }

  return (
    <dialog ref={ref} className="picker" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label={`Choisir ${ARTICLE[kind]}`}>
      {open && <>
      <header>
        <h2>Choisir {ARTICLE[kind]}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button>
      </header>
      <div className="picker-bar">
        <label className="lb-search">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Rechercher parmi vos ${KINDS[kind].toLowerCase()}s`} aria-label="Rechercher" />
        </label>
        <label className="lb-btn">
          <Icon name="upload" size={16} />Importer
          <input type="file" accept={`${kind}/*`} onChange={(e) => { importFiles(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {list.length ? (
        <ul className="picker-grid">
          {list.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => pick(a)} disabled={busy !== null} aria-label={`Utiliser ${a.name}`}>
                <AssetThumb asset={a} />
                <span>{a.name}</span>
                {busy === a.id && <i className="gx-spin" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="picker-empty">{assets.some((a) => a.kind === kind) ? 'Aucun résultat pour cette recherche.' : `Pas encore ${ARTICLE[kind]} dans votre bibliothèque. Générez-en ou importez-en : ils apparaîtront ici.`}</p>
      )}
      </>}
    </dialog>
  )
}
