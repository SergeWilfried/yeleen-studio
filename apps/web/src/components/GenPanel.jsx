import { useEffect, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import Menu from './Menu.jsx'
import { jetons, useJobs } from '../lib/jobs.jsx'
import { CAMERA_MOTIONS, videoCost } from '@studio/catalog'
import { useAssets } from '../lib/assets.jsx'
import AssetPicker from './AssetPicker.jsx'
import BrandToggle from './BrandToggle.jsx'
import MentionTextarea from './MentionTextarea.jsx'
import PlanTabs from './PlanTabs.jsx'
import { ROLE_LABEL, resolveMentions, tokenFor, tokensIn } from '../lib/mentions.js'
import { KINDS } from '../lib/assets.jsx'
import { useBrand } from '../lib/brand.jsx'
import { useToast } from '../lib/toasts.jsx'
import { DURATIONS, QUALITY, MODES, next } from '../lib/useGenSettings.js'
import '../styles/edit-panel.css'

/** Section à intitulé en petites capitales. */
export function Section({ id, title, children }) {
  return (
    <section className="ep-sec" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}

/** Liste « Standard / Brouillon ». */
export function QualityMenu({ s }) {
  return (
    <Menu items={QUALITY} value={s.quality} onChange={s.setQuality} label="Qualité" heading="Modes" menuWidth={290}>
      <span>{QUALITY.find((q) => q.id === s.quality).title}</span>
    </Menu>
  )
}

/**
 * Tuile de dépôt : un vrai sélecteur de fichier, avec aperçu pour une image.
 * `disabled` + `reason` : le modèle choisi n'accepte pas cette entrée ; `required` : il l'exige.
 */
export function DropTile({ icon, label, accept, file, onFile, disabled = false, reason, required = false }) {
  const [thumb, setThumb] = useState(null)
  const [picking, setPicking] = useState(false)
  const { addUpload } = useAssets()
  const toast = useToast()
  const kind = accept.split('/')[0]
  useEffect(() => {
    if (!file || !file.type.startsWith('image')) return setThumb(null)
    const url = URL.createObjectURL(file)
    setThumb(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  if (disabled) {
    return (
      <div className="ep-tile off" title={reason} aria-disabled="true">
        <Icon name="lock" size={18} />
        <span>{label}</span>
        <span className="sr-only">{reason}</span>
      </div>
    )
  }
  return (
    <>
      <label className={`ep-tile${file ? ' has' : ''}`} style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
        <input
          type="file"
          accept={accept}
          onChange={async (e) => {
            const f = e.target.files[0] ?? null
            const asset = f ? await addUpload(f).catch((err) => { toast(err.message); return null }) : null // les fichiers importés rejoignent la bibliothèque
            onFile(f, asset)
          }}
        />
        <Icon name={icon} size={20} />
        <span>{file ? file.name : label}</span>
        {required && !file && <em className="ep-req">requis</em>}
        {file && (
          <button type="button" className="ep-x" aria-label={`Retirer ${file.name}`} onClick={(e) => { e.preventDefault(); onFile(null) }}>
            <Icon name="close" size={12} />
          </button>
        )}
        <button type="button" className="ep-lib" aria-label={`${label} : choisir dans la bibliothèque`} title="Choisir dans la bibliothèque" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPicking(true) }}>
          <Icon name="folder" size={14} />
        </button>
      </label>
      <AssetPicker kind={kind} open={picking} onClose={() => setPicking(false)} onPick={onFile} />
    </>
  )
}

/** Ligne « Ajouter un média » : plusieurs fichiers image, vidéo ou audio. */
export function AddMedia({ label = 'Ajouter un média' }) {
  const [files, setFiles] = useState([])
  return (
    <>
      <label className="ep-add">
        <input type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => setFiles((x) => [...x, ...e.target.files])} />
        <span className="ep-chips" aria-hidden="true">
          {['img', 'vid', 'mus', 'user', 'shapes', 'palette', 'plus'].map((n) => <i key={n}><Icon name={n} size={14} /></i>)}
        </span>
        <span>{files.length ? `${files.length} média${files.length > 1 ? 's' : ''} ajouté${files.length > 1 ? 's' : ''}` : label}</span>
        {files.length > 0 && (
          <button type="button" className="ep-x ep-x-end" aria-label="Retirer tous les médias" onClick={(e) => { e.preventDefault(); setFiles([]) }}>
            <Icon name="close" size={12} />
          </button>
        )}
      </label>
      {files.length > 0 && <p className="ep-files">{files.map((f) => f.name).join(' · ')}</p>}
    </>
  )
}

/**
 * Plans (onglets numérotés) et zone d'instruction. `modeItems` remplace le menu Manuel / Auto

 * (par ex. la direction d'une extension) ; `hint` est le texte d'aide du plan unique.
 * `mentions` ({ files }) active les références « @asset » dans le texte ; `files` : les fichiers déjà posés dans les cases du panneau.
 */
export function PlanSection({ s, hint, modeItems = MODES, modeLabel = 'Mode de découpage', modeValue, onMode, single = false, singleReason, mentions = null }) {
  const area = useRef(null)
  const { assets } = useAssets()
  const resolved = mentions && s.caps ? resolveMentions({ plans: s.plans, refs: s.refs, assets, caps: s.caps, files: mentions.files }) : null
  // Les assets de la bibliothèque proposés par « @ », chacun avec son mot-clé (nom sans espaces ni accents)
  const libraryItems = mentions ? assets.map((a) => { const token = tokenFor(a, s.refs); return { key: a.id, token, label: a.name, sub: `${KINDS[a.kind]} · @${token}`, asset: a } }) : []
  const roles = resolved ? Object.fromEntries(resolved.mentions.map((m) => [m.token, m.role])) : {}
  const unused = resolved ? tokensIn(s.current.text, s.refs).filter((t) => roles[t] === 'unused') : [] // cités dans ce plan mais inutilisables par le modèle
  const value = modeValue ?? s.mode
  const insertAt = () => (mentions ? area.current?.insertAt() : (s.patch(s.active, { text: `${s.current.text}@` }), area.current?.focus()))
  return (
    <section className="ep-sec" aria-labelledby="ep-plan">
      <div className="ep-row">
        <PlanTabs s={s} single={single} singleReason={singleReason} />
        <Menu items={modeItems} value={value} onChange={onMode ?? s.setMode} label={modeLabel} menuWidth={260} className="ep-mode">
          <span>{modeItems.find((m) => m.id === value).title}</span>
        </Menu>
      </div>
      <div className="ep-prompt" role={s.multi ? 'tabpanel' : undefined} id="plan-panel" aria-labelledby={s.multi ? `plan-tab-${s.active}` : undefined}>
        {mentions ? (
          <MentionTextarea
            ref={area}
            value={s.current.text}
            onChange={(text) => s.patch(s.active, { text })}
            items={libraryItems}
            isRef={(t) => Boolean(s.refs[t])}
            roles={roles}
            onPick={(it) => s.addRef(it.token, it.asset.id)}
            emptyHint="La bibliothèque est vide : générez ou importez un fichier."
            placeholder={s.multi ? `Décrivez le plan ${s.active + 1} : qui y figure, ce qu’il fait, le mouvement de caméra… Tapez @ pour citer un asset.` : `${hint} Tapez @ pour citer un asset.`}
            aria-label={s.multi ? `Instruction du plan ${s.active + 1}` : 'Instruction'}
            rows={4}
            data-prompt
          />
        ) : (
          <textarea
            ref={area}
            value={s.current.text}
            onChange={(e) => s.patch(s.active, { text: e.target.value })}
            placeholder={s.multi ? `Décrivez le plan ${s.active + 1} : qui y figure, ce qu’il fait, le mouvement de caméra…` : hint}
            aria-label={s.multi ? `Instruction du plan ${s.active + 1}` : 'Instruction'}
            rows={4}
            data-prompt
          />
        )}
        {unused.length > 0 && <p className="ep-refnote">{unused.map((t) => `@${t}`).join(', ')} : {ROLE_LABEL.unused.toLowerCase()}.</p>}
        <div className="ep-pfoot">
          <button type="button" className="ep-at" aria-label="Insérer une référence" onClick={insertAt}><Icon name="at" size={16} /></button>
          {s.caps?.cameraMotion && (
            <Menu items={CAMERA_MOTIONS} value={s.camera} onChange={s.setCamera} label="Mouvement de caméra" menuWidth={230} className="ep-chip ep-cam">
              <Icon name="motion" size={16} />{CAMERA_MOTIONS.find((c) => c.id === s.camera).title.replace('Caméra : auto', 'Caméra')}
            </Menu>
          )}
          {s.multi && (
            <button type="button" className="ep-chip" aria-label={`Durée du plan ${s.active + 1} : ${s.current.dur} secondes`} onClick={() => s.patch(s.active, { dur: next(DURATIONS, s.current.dur) })}>
              <Icon name="clock" size={16} />{s.current.dur} s
            </button>
          )}
          <button type="button" className="ep-clear" aria-label="Effacer l’instruction" disabled={!s.current.text} onClick={() => s.patch(s.active, { text: '' })}><Icon name="close" size={14} /></button>
        </div>
      </div>
    </section>
  )
}

/** Résolution, durée (totale si plusieurs plans), format, son : chaque puce suit ce que le modèle accepte. */
export function OptionChips({ s }) {
  const durationLabel = `Durée ${s.multi ? 'totale' : ''} : ${s.total} secondes`
  const sound = s.soundMode === 'always' ? { text: 'ON', off: true, why: 'Ce modèle génère toujours une piste sonore' }
    : s.soundMode === 'provided' ? { text: 'Audio', off: true, why: 'La piste sonore est celle que vous fournissez' }
      : { text: s.sound ? 'ON' : 'OFF', off: false }
  return (
    <div className={`ep-opts${s.caps?.fps ? ' five' : ''}`}>
      {s.resolutions ? (
        <button type="button" className="ep-chip" disabled={s.draft} title="Résolution" aria-label={`Résolution : ${s.draft ? '480p' : s.res}`} onClick={() => s.setRes(next(s.resolutions, s.res))}>
          <Icon name="upscale" size={16} />{s.draft ? '480p' : s.res}
        </button>
      ) : (
        <button type="button" className="ep-chip" disabled title="Ce modèle ne propose pas de réglage de résolution" aria-label="Résolution : non réglable pour ce modèle">
          <Icon name="upscale" size={16} />Auto
        </button>
      )}
      <button
        type="button"
        className="ep-chip"
        disabled={s.multi || s.fromAudio}
        title={s.fromAudio ? `La durée est celle de votre audio (${s.caps.duration.fromAudio.min} à ${s.caps.duration.fromAudio.max} s)` : 'Durée'}
        aria-label={s.fromAudio ? `Durée : celle de l’audio${s.total ? `, ${s.total} secondes` : ''}` : durationLabel}
        onClick={() => s.patch(0, { dur: next(s.picks, s.plans[0].dur) })}
      >
        <Icon name="clock" size={16} />{s.fromAudio && !s.total ? '— s' : `${String(s.total).replace('.', ',')} s`}
      </button>
      {s.ratios ? (
        <button type="button" className="ep-chip" aria-label={`Format : ${s.ratio === 'auto' ? 'suit l’image de départ' : s.ratio}`} title={s.ratio === 'auto' ? 'Format : suit l’image de départ' : 'Format'} onClick={() => s.setRatio(next(s.ratios, s.ratio))}>
          <Icon name="screen" size={16} />{s.ratio === 'auto' ? 'Auto' : s.ratio}
        </button>
      ) : (
        <button type="button" className="ep-chip" disabled title="Le format suit l’image de départ (16:9 en texte seul)" aria-label="Format : suit l’image de départ">
          <Icon name="screen" size={16} />Auto
        </button>
      )}
      {s.caps?.fps && (
        <button type="button" className="ep-chip" title="Images par seconde" aria-label={`Images par seconde : ${s.fps}`} onClick={() => s.setFps(next(s.caps.fps, s.fps))}>
          <Icon name="gauge" size={16} />{s.fps} i/s
        </button>
      )}
      <button type="button" className="ep-chip" disabled={sound.off} title={sound.why} aria-pressed={s.sound} aria-label="Son" onClick={() => s.setSound((v) => !v)}>
        <Icon name="sound" size={16} />{sound.text}
      </button>
    </div>
  )
}

/**
 * Bouton Générer collé en bas du panneau défilant : soumet une génération vidéo et affiche le coût en jetons.
 * `blocker` : raison pour laquelle le modèle choisi ne peut pas encore générer (ex. image de départ requise).
 */
export function GenerateBar({ s, title, meta, blocker, cost = s.cost, needsText = true, secs = s.total, brand = false, live = null }) {
  const { submit } = useJobs()
  const { brand: kit, style } = useBrand()
  const styled = brand && kit.apply && Boolean(style) // style visuel de la marque, ajouté à la description
  const [error, setError] = useState('')
  const { assets, getFile } = useAssets()
  // Modèle à références (Seedance) : les vidéos citées sont facturées en entrée, le prix affiché en tient compte.
  const preview = live?.model.caps.references ? resolveMentions({ plans: s.plans, refs: s.refs, assets, caps: live.model.caps, files: live.files }) : null
  const inputSecs = preview ? preview.references.filter((r) => r.kind === 'video').reduce((n, r) => n + (r.asset.secs || 0), 0) : 0
  const price = preview ? videoCost(live.model, secs, s.resolutions ? s.res : undefined, { inputSecs }) : cost
  const onClick = async () => {
    const prompt = s.plans.map((p) => p.text.trim()).filter(Boolean).join(' / ')
    const base = meta ?? `${s.total} s · ${s.ratio} · ${s.draft ? '480p' : s.res}`
    // Demande réelle : le modèle choisi, les options retenues et les fichiers d'entrée que ce modèle accepte.
    const c = live?.model.caps
    // Assets cités par « @ » : ce que le modèle peut en faire (image de départ, élément…) et leurs fichiers.
    const ref = live ? resolveMentions({ plans: s.plans, refs: s.refs, assets, caps: c, files: live.files }) : null
    let extra = {}
    if (ref) {
      try {
        const get = (a) => (a ? getFile(a) : null)
        const [start, end, audio] = await Promise.all([get(ref.slots.start), get(ref.slots.end), get(ref.slots.audio)])
        const elements = await Promise.all(ref.elements.map(async (a) => ({ kind: a.kind, file: await getFile(a) })))
        const references = await Promise.all(ref.references.map(async (r) => ({ kind: r.kind, file: await getFile(r.asset) })))
        extra = { start, end, audio, elements, references }
      } catch {
        setError('Un asset cité est introuvable : réimportez-le ou retirez la référence.')
        return
      }
    }
    const liveSpec = live && {
      kind: 'video', modelId: live.model.id, plans: s.plans.map(({ dur }, i) => ({ text: ref.texts[i], dur })), secs: Math.round(secs * 10) / 10,
      resolution: s.resolutions ? s.res : undefined, ratio: s.ratios ? s.ratio : undefined, fps: c.fps ? s.fps : undefined, sound: s.sound, camera: s.camera,
      brandStyle: styled ? style : undefined,
      files: { start: c.startFrame !== 'none' ? (live.files.start ?? extra.start) : null, end: c.endFrame ? (live.files.end ?? extra.end) : null, audio: c.audioRef ? (live.files.audio ?? extra.audio) : null },
      elements: extra.elements?.length ? extra.elements : undefined,
      references: extra.references?.length ? extra.references : undefined,
      inputSecs: inputSecs || undefined,
    }
    const r = submit({ kind: 'video', title, prompt, cost: price, secs, brandStyle: styled ? style : undefined, live: liveSpec, meta: styled ? `${base} · style de la marque` : base })
    setError(r.ok ? '' : `Solde insuffisant : il manque ${jetons(r.missing)} jetons.`)
  }
  return (
    <div className="ep-gen">
      {error && <p className="ep-gerr" role="alert">{error}</p>}
      {/* {blocker && <p className="ep-ghint">{blocker}</p>} */}
      <button type="button" className="gen" disabled={(needsText && !s.ready) || Boolean(blocker)} onClick={onClick}>
        Générer<span><Icon name="sparkle" size={16} />{jetons(price)}</span>
      </button>
    </div>
  )
}
