import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import Menu from '../Menu.jsx'
import AssetThumb from '../AssetThumb.jsx'
import { KINDS, useAssets } from '../../lib/assets.jsx'
import { CATEGORIES, useCatalog } from '../../lib/catalog.jsx'
import { features } from '../../lib/features.js'
import { useToast } from '../../lib/toasts.jsx'
import useTabKeys from '../../lib/useTabKeys.js'

const EMPTY = []
const SORTS = [{ id: 'recent', title: 'Plus récents' }, { id: 'old', title: 'Plus anciens' }, { id: 'name', title: 'Nom' }]
const ORIGINS = [{ id: 'all', title: 'Tout' }, { id: 'upload', title: 'Importés' }, { id: 'generated', title: 'Générés' }]
const BY_KIND = [{ id: 'all', label: 'Tout' }, { id: 'image', label: 'Images' }, { id: 'video', label: 'Vidéos' }, { id: 'audio', label: 'Audio' }]

// Les trois entrées de la barre latérale, chacune avec ses propres filtres.
const TABS = [
  { id: 'library', label: 'Ma bibliothèque', icon: 'folder', subs: [{ id: 'recent', label: 'Récents' }, ...BY_KIND] },
  { id: 'yeleen', label: 'Bibliothèque Yeleen', icon: 'sparkle', subs: [{ id: 'all', label: 'Tout' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))] },
  { id: 'favs', label: 'Favoris', icon: 'star', subs: BY_KIND },
]

/**
 * Fenêtre de choix des références, avec trois entrées dans la barre latérale :
 *  - Ma bibliothèque : tout ce qui est à moi, importé ou généré (filtre par origine et par type) ;
 *  - Bibliothèque Yeleen : personnages, objets (images) et vidéos proposés à tous ;
 *  - Favoris : les éléments marqués d'une étoile, de l'une ou l'autre bibliothèque.
 * Plusieurs fichiers peuvent être cochés puis ajoutés d'un coup.
 */
export default function AssetModal({ open, onClose, onAdd, taken = [], initialSub = 'recent' }) {
  const ref = useRef(null)
  const { assets, importMany, update } = useAssets()
  const catalog = useCatalog()
  const toast = useToast()
  const onTabKeys = useTabKeys()
  const tabs = TABS.filter((t) => t.id !== 'yeleen' || features.catalog)
  const [tab, setTab] = useState('library')
  const [subs, setSubs] = useState({ library: initialSub, yeleen: 'all', favs: 'all' })
  const [origin, setOrigin] = useState('all')
  const [sort, setSort] = useState('recent')
  const [picked, setPicked] = useState(() => new Set())
  const sub = subs[tab]
  const setSub = (v) => setSubs((s) => ({ ...s, [tab]: v }))

  useEffect(() => {
    const d = ref.current
    if (open && !d.open) { setTab('library'); setSubs({ library: initialSub, yeleen: 'all', favs: 'all' }); setOrigin('all'); setPicked(new Set()); d.showModal() }
    if (!open && d.open) d.close()
  }, [open, initialSub])

  const yeleen = features.catalog ? catalog.items : EMPTY
  const byId = useMemo(() => new Map([...assets, ...yeleen].map((a) => [a.id, a])), [assets, yeleen])
  const favorite = (a) => (a.source === 'yeleen' ? catalog.favs.has(a.id) : a.starred)
  const toggleFav = (a) => (a.source === 'yeleen' ? catalog.toggleFav(a.id) : update(a.id, { starred: !a.starred }))

  const counts = { library: assets.length, yeleen: yeleen.length, favs: [...assets, ...yeleen].filter(favorite).length }

  const list = useMemo(() => {
    let out
    if (tab === 'library') out = assets.filter((a) => origin === 'all' || a.source === origin)
    else if (tab === 'yeleen') out = yeleen
    else out = [...assets, ...yeleen].filter(favorite)
    if (tab === 'yeleen' && sub !== 'all') out = out.filter((a) => a.category === sub)
    else if (sub === 'image' || sub === 'video' || sub === 'audio') out = out.filter((a) => a.kind === sub)
    out = [...out].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'fr') : sort === 'old' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)) // à date égale (catalogue), l'ordre du fichier est conservé
    return tab === 'library' && sub === 'recent' ? out.slice(0, 24) : out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, yeleen, catalog.favs, tab, sub, origin, sort])

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const upload = async (files) => {
    const { added, unsupported, errors } = await importMany(files)
    errors.forEach((m) => toast(m))
    if (!added.length) return unsupported ? toast('Format non pris en charge : image, vidéo ou audio.') : undefined
    setTab('library')
    setPicked((s) => new Set([...s, ...added.map((a) => a.id)]))
  }
  const add = () => { onAdd([...picked].map((id) => byId.get(id)).filter(Boolean)); onClose() } // dans l'ordre où on les a cochés

  const empty = tab === 'yeleen'
    ? (catalog.status === 'loading' ? 'Chargement de la bibliothèque Yeleen…' : catalog.status === 'error' ? null : 'Rien dans cette catégorie pour l’instant.')
    : tab === 'favs' ? 'Touchez l’étoile d’un élément pour le retrouver ici.' : 'Rien ici pour l’instant. Importez un fichier ou générez-en un.'

  return (
    <dialog ref={ref} className="am-dlg" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="Ajouter des références">
      <nav className="am-side" aria-label="Bibliothèques">
        <div role="tablist" aria-orientation="vertical" aria-label="Bibliothèque" onKeyDown={onTabKeys}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`am-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="am-main" title={t.label} tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'on' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={18} />
              <span className="am-lb">{t.label}</span>
              <small aria-label={`${counts[t.id]} élément${counts[t.id] > 1 ? 's' : ''}`}>{counts[t.id]}</small>
            </button>
          ))}
        </div>
      </nav>

      <div className="am-panel" id="am-main" role="tabpanel" aria-labelledby={`am-tab-${tab}`}>
        <div className="am-sub">
          <div className="am-subs" role="tablist" aria-label="Type" onKeyDown={onTabKeys}>
            {tabs.find((t) => t.id === tab).subs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={sub === t.id} tabIndex={sub === t.id ? 0 : -1} className={sub === t.id ? 'on' : undefined} onClick={() => setSub(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="am-end">
            {tab === 'library' && (
              <Menu items={ORIGINS} value={origin} onChange={setOrigin} label="Origine" menuWidth={180} className="am-sort">
                <Icon name="filter" size={16} /><span>{origin === 'all' ? 'Origine' : ORIGINS.find((o) => o.id === origin).title}</span>
              </Menu>
            )}
            <Menu items={SORTS} value={sort} onChange={setSort} label="Trier par" menuWidth={200} className="am-sort">
              <Icon name="sort" size={16} /><span>Trier par</span>
            </Menu>
            <button type="button" className="am-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
          </div>
        </div>

        <div className="am-grid">
          {tab === 'library' && (
            <label className="am-up">
              <input type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
              <span className="am-cloud"><Icon name="upload" size={22} /></span>
              <span>Importer un fichier</span>
            </label>
          )}
          {list.map((a) => {
            const on = picked.has(a.id)
            const had = taken.includes(a.id)
            const fav = favorite(a)
            return (
              <div key={a.id} className="am-cell">
                <button type="button" className={`am-it${on ? ' on' : ''}`} aria-pressed={on} disabled={had} onClick={() => toggle(a.id)} aria-label={`${a.name} (${KINDS[a.kind]})${a.source === 'yeleen' ? ', bibliothèque Yeleen' : ''}${had ? ', déjà ajouté' : ''}`}>
                  <AssetThumb asset={a} />
                  <span className="am-nm">{a.name}</span>
                  {(on || had) && <span className="am-ck" aria-hidden="true"><Icon name="check" size={14} /></span>}
                </button>
                {a.source === 'yeleen' && <span className="am-tag">{a.placeholder ? 'Exemple' : 'Yeleen'}</span>}
                <button type="button" className={`am-fav${fav ? ' on' : ''}`} aria-pressed={fav} aria-label={`${fav ? 'Retirer des' : 'Ajouter aux'} favoris : ${a.name}`} onClick={() => toggleFav(a)}>
                  <Icon name="star" size={15} fill={fav ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
        </div>
        {list.length === 0 && empty && <p className="am-empty">{empty}</p>}
        {tab === 'yeleen' && catalog.status === 'error' && (
          <p className="am-empty">La bibliothèque Yeleen est indisponible pour l’instant. <button type="button" className="am-retry" onClick={catalog.reload}>Réessayer</button></p>
        )}

        {picked.size > 0 && (
          <div className="am-bar" role="region" aria-label="Sélection">
            <button type="button" className="am-add" onClick={add}>Ajouter {picked.size} fichier{picked.size > 1 ? 's' : ''}</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
