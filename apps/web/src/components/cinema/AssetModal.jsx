import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import Menu from '../Menu.jsx'
import AssetThumb from '../AssetThumb.jsx'
import { KINDS, useAssets } from '../../lib/assets.jsx'
import { useToast } from '../../lib/toasts.jsx'
import useTabKeys from '../../lib/useTabKeys.js'

const TABS = [
  { id: 'upload', label: 'Imports', icon: 'upload', pick: (a) => a.source === 'upload' },
  { id: 'generated', label: 'Générations', icon: 'sparkle', pick: (a) => a.source === 'generated' },
  { id: 'starred', label: 'Favoris', icon: 'star', pick: (a) => a.starred },
]
const SUBS = [
  { id: 'recent', label: 'Récents' },
  { id: 'all', label: 'Tout' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Vidéos' },
  { id: 'audio', label: 'Audio' },
]
const SORTS = [{ id: 'recent', title: 'Plus récents' }, { id: 'old', title: 'Plus anciens' }, { id: 'name', title: 'Nom' }]

/**
 * Fenêtre de choix des références : la bibliothèque par origine (imports, générations, favoris) et par type,
 * avec un bouton pour importer. L'origine se choisit dans la barre latérale à gauche. Plusieurs fichiers peuvent être cochés puis ajoutés d'un coup.
 */
export default function AssetModal({ open, onClose, onAdd, taken = [], initialSub = 'recent' }) {
  const ref = useRef(null)
  const { assets, addUpload } = useAssets()
  const toast = useToast()
  const onTabKeys = useTabKeys()
  const [tab, setTab] = useState('upload')
  const [sub, setSub] = useState(initialSub)
  const [sort, setSort] = useState('recent')
  const [picked, setPicked] = useState(() => new Set())

  useEffect(() => {
    const d = ref.current
    if (open && !d.open) { setSub(initialSub); setPicked(new Set()); d.showModal() }
    if (!open && d.open) d.close()
  }, [open, initialSub])

  const list = useMemo(() => {
    const inTab = TABS.find((t) => t.id === tab).pick
    let out = assets.filter(inTab)
    if (sub === 'image' || sub === 'video' || sub === 'audio') out = out.filter((a) => a.kind === sub)
    out = [...out].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'fr') : sort === 'old' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt))
    return sub === 'recent' ? out.slice(0, 24) : out
  }, [assets, tab, sub, sort])

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const upload = async (files) => {
    const added = (await Promise.all([...files].map(addUpload))).filter(Boolean)
    if (!added.length) return toast('Format non pris en charge : image, vidéo ou audio.')
    setTab('upload')
    setPicked((s) => new Set([...s, ...added.map((a) => a.id)]))
  }
  const add = () => { onAdd([...picked].map((id) => assets.find((a) => a.id === id)).filter(Boolean)); onClose() } // dans l'ordre où on les a cochés

  return (
    <dialog ref={ref} className="am-dlg" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="Ajouter des références">
      <nav className="am-side" aria-label="Origine des fichiers">
        <div role="tablist" aria-orientation="vertical" aria-label="Origine" onKeyDown={onTabKeys}>
          {TABS.map((t) => {
            const n = assets.filter(t.pick).length
            return (
              <button key={t.id} type="button" role="tab" id={`am-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="am-main" title={t.label} tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'on' : undefined} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} />
                <span className="am-lb">{t.label}</span>
                <small aria-label={`${n} fichier${n > 1 ? 's' : ''}`}>{n}</small>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="am-panel" id="am-main" role="tabpanel" aria-labelledby={`am-tab-${tab}`}>
        <div className="am-sub">
          <div className="am-subs" role="tablist" aria-label="Type" onKeyDown={onTabKeys}>
            {SUBS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={sub === t.id} tabIndex={sub === t.id ? 0 : -1} className={sub === t.id ? 'on' : undefined} onClick={() => setSub(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="am-end">
            <Menu items={SORTS} value={sort} onChange={setSort} label="Trier par" menuWidth={200} className="am-sort">
              <Icon name="sort" size={16} /><span>Trier par</span>
            </Menu>
            <button type="button" className="am-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
          </div>
        </div>

        <div className="am-grid">
          <label className="am-up">
            <input type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
            <span className="am-cloud"><Icon name="upload" size={22} /></span>
            <span>Importer un fichier</span>
          </label>
          {list.map((a) => {
            const on = picked.has(a.id)
            const had = taken.includes(a.id)
            return (
              <button key={a.id} type="button" className={`am-it${on ? ' on' : ''}`} aria-pressed={on} disabled={had} onClick={() => toggle(a.id)} aria-label={`${a.name} (${KINDS[a.kind]})${had ? ', déjà ajouté' : ''}`}>
                <AssetThumb asset={a} />
                <span className="am-nm">{a.name}</span>
                {(on || had) && <span className="am-ck" aria-hidden="true"><Icon name="check" size={14} /></span>}
              </button>
            )
          })}
        </div>
        {list.length === 0 && <p className="am-empty">Rien ici pour l’instant. Importez un fichier ou générez-en un.</p>}

        {picked.size > 0 && (
          <div className="am-bar" role="region" aria-label="Sélection">
            <button type="button" className="am-add" onClick={add}>Ajouter {picked.size} fichier{picked.size > 1 ? 's' : ''}</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
