import useDocumentTitle from '../lib/useDocumentTitle.js'
import { features } from '../lib/features.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import PromoBar from '../components/PromoBar.jsx'
import AssetThumb, { fmtSecs } from '../components/AssetThumb.jsx'
import { downloadAsset, useSendActions } from '../components/SendToMenu.jsx'
import { KINDS, useAssets } from '../lib/assets.jsx'
import { jetonLabel } from '../lib/jobs.jsx'
import { useToast } from '../lib/toasts.jsx'
import '../styles/shell.css'
import '../styles/library.css'


const FILTERS = [
  { id: 'all', label: 'Tout', icon: 'folder' },
  { id: 'image', label: 'Images', icon: 'img' },
  { id: 'video', label: 'Vidéos', icon: 'vid' },
  { id: 'audio', label: 'Audio', icon: 'mus' },
  { id: 'starred', label: 'Favoris', icon: 'star' },
]
const SOURCES = [{ id: 'generated', label: 'Générés' }, { id: 'upload', label: 'Importés' }]
const SORTS = { recent: 'Plus récents', old: 'Plus anciens', name: 'Nom' }
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const sizeFmt = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`)

/** Panneau de détail : aperçu, informations, « Envoyer vers » et actions de gestion. */
function Inspector({ asset, onRemove }) {
  const { update } = useAssets()
  const toast = useToast()
  const actions = useSendActions(asset)
  const [name, setName] = useState(asset.name)
  useEffect(() => setName(asset.name), [asset.id, asset.name])
  const assets = useAssets()
  const commit = () => { const n = name.trim(); if (n && n !== asset.name) update(asset.id, { name: n }); else setName(asset.name) }
  const rows = [
    ['Type', KINDS[asset.kind]],
    ['Origine', asset.source === 'generated' ? 'Généré' : 'Importé'],
    asset.model && ['Modèle', asset.model],
    asset.meta && ['Réglages', asset.meta],
    asset.secs != null && ['Durée', fmtSecs(asset.secs)],
    asset.size != null && ['Taille', sizeFmt(asset.size)],
    asset.cost != null && ['Coût', jetonLabel(asset.cost)],
    asset.origin?.runId && ['Chaîne', `Étape ${asset.origin.step + 1}`],
    ['Date', dateFmt.format(asset.createdAt)],
  ].filter(Boolean)

  return (
    <aside className="lb-ins" aria-label="Détail de l’asset">
      <AssetThumb asset={asset} large />
      <div className="lb-ins-body">
        <div className="lb-ins-title">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Nom de l’asset" />
          <button type="button" className={`icon-btn${asset.starred ? ' on' : ''}`} aria-pressed={asset.starred} aria-label={asset.starred ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => update(asset.id, { starred: !asset.starred })}>
            <Icon name="star" size={18} fill={asset.starred ? 'currentColor' : 'none'} />
          </button>
        </div>

        {asset.prompt && (
          <div className="lb-prompt">
            <p>{asset.prompt}</p>
            <button type="button" onClick={() => navigator.clipboard?.writeText(asset.prompt).then(() => toast('Prompt copié.'))}><Icon name="copy" size={14} />Copier</button>
          </div>
        )}

        <section aria-label="Envoyer vers">
          <h3>Envoyer vers</h3>
          <ul className="lb-send">
            {actions.filter((a) => a.id !== 'dl').map((a) => (
              <li key={a.id}>
                <button type="button" onClick={a.run}>
                  <Icon name={a.icon} size={17} />
                  <span><b>{a.title}</b><small>{a.aside}</small></span>
                  <Icon name="chevR" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <dl className="lb-meta">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

        <div className="lb-ins-actions">
          <button type="button" onClick={() => downloadAsset(assets, asset).catch(() => toast('Téléchargement impossible : fichier introuvable.'))}><Icon name="download" size={16} />Télécharger</button>
          <button type="button" className="danger" onClick={() => onRemove([asset.id])}><Icon name="trash" size={16} />Supprimer</button>
        </div>
      </div>
    </aside>
  )
}

function AssetsView({ focusId }) {
  const { assets, addUpload, update, remove, restore, purge } = useAssets()
  const toast = useToast()
  const [params] = useSearchParams() // ?filter=starred|image|video|audio et ?source=upload|generated : vue d'arrivée depuis un lien
  const [filter, setFilter] = useState(() => (['image', 'video', 'audio', 'starred'].includes(params.get('filter')) ? params.get('filter') : 'all'))
  const [source, setSource] = useState(() => (['generated', 'upload'].includes(params.get('source')) ? params.get('source') : null))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const [selected, setSelected] = useState(focusId ?? null)
  const [checked, setChecked] = useState(() => new Set())
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => { if (focusId) { setSelected(focusId); setFilter('all'); setSource(null) } }, [focusId])

  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter((a) => a.kind === 'image').length,
    video: assets.filter((a) => a.kind === 'video').length,
    audio: assets.filter((a) => a.kind === 'audio').length,
    starred: assets.filter((a) => a.starred).length,
    generated: assets.filter((a) => a.source === 'generated').length,
    upload: assets.filter((a) => a.source === 'upload').length,
  }), [assets])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = assets.filter((a) => (filter === 'all' ? true : filter === 'starred' ? a.starred : a.kind === filter)
      && (!source || a.source === source)
      && (!needle || `${a.name} ${a.prompt ?? ''} ${a.model ?? ''}`.toLowerCase().includes(needle)))
    return sort === 'name' ? out.sort((a, b) => a.name.localeCompare(b.name, 'fr')) : sort === 'old' ? out.sort((a, b) => a.createdAt - b.createdAt) : out.sort((a, b) => b.createdAt - a.createdAt)
  }, [assets, filter, source, q, sort])

  const current = assets.find((a) => a.id === selected) ?? null

  const importFiles = async (fl) => {
    const added = (await Promise.all([...fl].map(addUpload))).filter(Boolean)
    const skipped = fl.length - added.length
    if (added.length) { setSelected(added[0].id); toast(`${added.length} fichier${added.length > 1 ? 's' : ''} importé${added.length > 1 ? 's' : ''}.`) }
    if (skipped) toast(`${skipped} fichier${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''} : seuls les images, vidéos et audios sont acceptés.`)
  }

  const removeIds = (ids) => {
    remove(ids)
    setChecked(new Set())
    if (ids.includes(selected)) setSelected(null)
    const timer = setTimeout(() => purge(ids), 9000)
    toast(`${ids.length} asset${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`, { label: 'Annuler', onClick: () => { clearTimeout(timer); restore() } })
  }
  const toggleChecked = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div
      className={`lb-body${dragging ? ' drag' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); importFiles(e.dataTransfer.files) }}
    >
      <nav className="lb-filters" aria-label="Filtres">
        <ul>
          {FILTERS.map((f) => (
            <li key={f.id}>
              <button type="button" aria-pressed={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                <Icon name={f.icon} size={17} /><span>{f.label}</span><em>{counts[f.id]}</em>
              </button>
            </li>
          ))}
        </ul>
        <p className="lb-sub">Origine</p>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={source === s.id} className={source === s.id ? 'on' : ''} onClick={() => setSource(source === s.id ? null : s.id)}>
                <span>{s.label}</span><em>{counts[s.id]}</em>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="lb-main" aria-label="Assets">
        <div className="lb-tools">
          <label className="lb-search">
            <Icon name="search" size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, un prompt, un modèle" aria-label="Rechercher" />
          </label>
          <label className="lb-sort">
            <span className="sr-only">Trier</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button type="button" className="lb-btn main" onClick={() => fileInput.current.click()}><Icon name="upload" size={16} />Importer</button>
          <input ref={fileInput} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => { importFiles(e.target.files); e.target.value = '' }} />
        </div>

        {list.length ? (
          <ul className="lb-grid">
            {list.map((a) => (
              <li key={a.id} className={`${selected === a.id ? 'sel' : ''}${checked.has(a.id) ? ' chk' : ''}`}>
                <button type="button" className="lb-card" aria-pressed={selected === a.id} onClick={() => setSelected(a.id)} onKeyDown={(e) => (e.key === 'Delete' || e.key === 'Backspace') && removeIds(checked.size ? [...checked] : [a.id])} aria-label={`${KINDS[a.kind]} : ${a.name}`}>
                  <AssetThumb asset={a} />
                  <span className="lb-name">{a.name}</span>
                  <span className="lb-cap">{KINDS[a.kind]} · {a.source === 'generated' ? 'Généré' : 'Importé'}</span>
                </button>
                <label className="lb-check"><input type="checkbox" checked={checked.has(a.id)} onChange={() => toggleChecked(a.id)} aria-label={`Sélectionner ${a.name}`} /><i><Icon name="check" size={13} /></i></label>
                <button type="button" className={`lb-star${a.starred ? ' on' : ''}`} aria-pressed={a.starred} aria-label={a.starred ? `Retirer ${a.name} des favoris` : `Ajouter ${a.name} aux favoris`} onClick={() => update(a.id, { starred: !a.starred })}>
                  <Icon name="star" size={15} fill={a.starred ? 'currentColor' : 'none'} />
                </button>
              </li>
            ))}
          </ul>
        ) : assets.length ? (
          <div className="lb-empty">
            <h2>Aucun résultat</h2>
            <p>Aucun asset ne correspond à ces filtres.</p>
            <button type="button" className="lb-btn" onClick={() => { setFilter('all'); setSource(null); setQ('') }}>Réinitialiser les filtres</button>
          </div>
        ) : (
          <div className="lb-empty">
            <h2>Votre bibliothèque est vide</h2>
            <p>Les images, vidéos et voix que vous générez s’y ajoutent automatiquement. Vous pouvez aussi y glisser vos propres fichiers.</p>
            <div className="lb-empty-go">
              <Link to="/cinema" className="lb-btn">Créer dans le studio</Link>
              {features.image && <Link to="/image" className="lb-btn">Générer une image</Link>}
              {features.video && <Link to="/video" className="lb-btn">Créer une vidéo</Link>}
              {features.audio && <Link to="/audio" className="lb-btn">Écrire une voix</Link>}
              <button type="button" className="lb-btn main" onClick={() => fileInput.current.click()}><Icon name="upload" size={16} />Importer des fichiers</button>
            </div>
          </div>
        )}

        {checked.size > 0 && (
          <div className="lb-bulk" role="region" aria-label="Sélection">
            <b>{checked.size} sélectionné{checked.size > 1 ? 's' : ''}</b>
            <button type="button" onClick={() => setChecked(new Set())}>Désélectionner</button>
            <button type="button" className="danger" onClick={() => removeIds([...checked])}><Icon name="trash" size={15} />Supprimer</button>
          </div>
        )}
        {dragging && <div className="lb-drop" aria-hidden="true"><Icon name="upload" size={28} /><b>Déposez vos fichiers</b><span>Images, vidéos et audios</span></div>}
      </section>

      {current ? <Inspector asset={current} onRemove={removeIds} /> : (
        <aside className="lb-ins idle" aria-label="Détail de l’asset">
          <p>Sélectionnez un asset pour le prévisualiser, le renommer ou l’envoyer vers un outil.</p>
        </aside>
      )}
    </div>
  )
}

export default function Library() {
  useDocumentTitle('Bibliothèque')
  const [params] = useSearchParams()

  return (
    <div className="pg shell library">
      <SkipLink />
      <PromoBar seconds={2 * 3600 + 53 * 60 + 15} cta="Obtenir 50 % de remise">
        Génération illimitée sur les formules Max. Remise personnelle de 50 %
      </PromoBar>
      <ShellHeader />
      <main className="lb" id="main" tabIndex={-1}>
        <header className="lb-head">
          <h1>Bibliothèque</h1>
        </header>
        <div id="lb-panel" className="lb-panel">
          <AssetsView focusId={params.get('asset')} />
        </div>
      </main>
    </div>
  )
}
