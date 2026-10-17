import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import { IMAGE_MODELS, VIDEO_MODELS, findModel, imageCost, videoCost } from '@studio/catalog'
import { RECIPES, recipeById, recipeCost } from '@studio/catalog/recipes'
import { SkipLink } from '../components/Headers.jsx'
import Menu from '../components/Menu.jsx'
import MentionTextarea from '../components/MentionTextarea.jsx'
import PlanTabs from '../components/PlanTabs.jsx'
import AssetThumb from '../components/AssetThumb.jsx'
import BrandToggle from '../components/BrandToggle.jsx'
import GenerationTray from '../components/GenerationTray.jsx'
import ModelLogo from '../components/ModelLogo.jsx'
import Sidebar from '../components/cinema/Sidebar.jsx'
import HeroStack from '../components/cinema/HeroStack.jsx'
import AssetModal from '../components/cinema/AssetModal.jsx'
import { RecipeCards, RecipeForm, RunStrip } from '../components/cinema/Recipes.jsx'
import { useAssets } from '../lib/assets.jsx'
import { useBrand } from '../lib/brand.jsx'
import { useHandoff } from '../lib/handoff.jsx'
import { jetons, useJobs } from '../lib/jobs.jsx'
import { ATTACH_PATTERN, labelAttachments, resolveAttachments } from '../lib/mentions.js'
import { logoFor } from '../lib/modelLogos.js'
import { modelItem } from '../lib/modelItem.js'
import { useToast } from '../lib/toasts.jsx'
import useDocumentTitle from '../lib/useDocumentTitle.js'
import useGenSettings from '../lib/useGenSettings.js'
import '../styles/shell.css'
import '../styles/library.css'
import '../styles/cinema.css'

// Le modèle audio vers vidéo se pilote par un fichier audio : il a sa place dans l'écran Vidéo, pas ici.
const VIDEO_LIST = VIDEO_MODELS.filter((m) => m.input !== 'audio')
const CINEMA = ['seedance-2-5', 'kling-3-pro', 'h3-max'] // modèles pensés pour le récit : références, personnages, plans fidèles au texte
const rank = (id) => (CINEMA.includes(id) ? CINEMA.indexOf(id) : CINEMA.length)
const VIDEO_ITEMS = [...VIDEO_LIST]
  .sort((a, b) => rank(a.id) - rank(b.id))
  .map((m) => ({ ...modelItem(m, 'video'), group: CINEMA.includes(m.id) ? 'Modèles cinéma' : 'Autres modèles' }))
const IMAGE_ITEMS = IMAGE_MODELS.map((m) => modelItem(m, 'image'))
const MODES = [
  { id: 'refs', icon: 'layers', title: 'Références' },
  { id: 'next', icon: 'extend', title: 'Suite' },
  { id: 'prev', icon: 'revert', title: 'Avant' },
  { id: 'edit', icon: 'wand', title: 'Modifier la vidéo' },
]
const nextOf = (list, v) => list[(list.indexOf(v) + 1) % list.length]

/** Une barre qui défile quand elle est trop étroite, avec la flèche qui montre qu'il y a une suite. */
function ChipScroll({ children }) {
  const box = useRef(null)
  const [more, setMore] = useState({ right: false, left: false })
  const measure = () => {
    const el = box.current
    if (!el) return
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    const left = el.scrollLeft > 2
    setMore((m) => (m.right === right && m.left === left ? m : { right, left })) // sans changement, pas de nouveau rendu
  }
  useEffect(measure) // le contenu peut changer sans que la barre change de taille (texte d'une puce)
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  return (
    <>
      <div className="cn-scroll" ref={box} onScroll={measure}>{children}</div>
      {(more.right || more.left) && (
        <button type="button" className="cn-more" aria-label={more.right ? 'Voir les autres réglages' : 'Revenir aux premiers réglages'} onClick={() => box.current.scrollBy({ left: more.right ? 260 : -260, behavior: 'smooth' })}>
          <Icon name={more.right ? 'chevR' : 'chevL'} size={16} />
        </button>
      )}
    </>
  )
}

export default function Cinema() {
  useDocumentTitle('Studio cinéma')
  const toast = useToast()
  const { jobs, submit, balance } = useJobs()
  const { assets, getFile } = useAssets()
  const { sendTo, take } = useHandoff()
  const { brand: kit, style } = useBrand()
  const area = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState('video')
  const [itext, setItext] = useState('') // texte de l'image ; en vidéo, chaque plan porte le sien (s.plans)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(null) // 'recent' | 'video' : la fenêtre des références est ouverte
  const [att, setAtt] = useState([]) // pièces jointes : [{ id, assetId }], dans l'ordre d'ajout

  // Vidéo : le panneau de réglages partagé avec l'écran Vidéo (durées, résolutions, formats, son selon le modèle)
  const [videoId, setVideoId] = useState(CINEMA[0])
  const [task, setTask] = useState('refs') // modèle à références : 'refs' (références), 'next' (prolonger la vidéo jointe), 'edit' (la modifier)
  const vmodel = findModel(VIDEO_LIST, videoId)
  const s = useGenSettings(vmodel)
  // Image
  const [imageId, setImageId] = useState(IMAGE_MODELS[0].id)
  const imodel = findModel(IMAGE_MODELS, imageId)
  const [iRatio, setIRatio] = useState('Auto')
  const [iRes, setIRes] = useState('2K')
  const [iCount, setICount] = useState(1)
  const iRes2 = imodel.caps.resolutions.includes(iRes) ? iRes : imodel.caps.resolutions.includes('2K') ? '2K' : imodel.caps.resolutions[0]
  const iN = Math.min(iCount, imodel.caps.maxImages)

  // Recettes : une photo et quelques mots donnent plusieurs plans ; chaque plan est une génération vidéo
  const [recipeId, setRecipeId] = useState(null)
  const [rtext, setRtext] = useState('')
  const [photos, setPhotos] = useState({}) // une photo par entrée de la recette : { photo } ou { model, garment }
  const [run, setRun] = useState(null) // { id, recipeId, shots } : la recette en cours
  const [rerror, setRerror] = useState('')
  const recipe = mode === 'recipe'
  const changeMode = (m) => { setMode(m); setError(''); if (m === 'recipe' && !recipeId) pickRecipe(RECIPES[0].id) }
  const pickRecipe = (id) => { setRecipeId(id); setRtext((recipeById(id).text?.example ?? '')); setRerror('') }
  useEffect(() => { // « Envoyer vers » une recette : l'image arrive comme photo de départ
    const h = take('cinema.recipe')
    const a = h && assets.find((x) => x.id === h.assetId)
    if (!a) return
    setMode('recipe'); setRecipeId(h.recipeId); setPhotos({ [recipeById(h.recipeId).photos[0].key]: a }); setRtext((recipeById(h.recipeId).text?.example ?? ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const runJobs = run ? jobs.filter((j) => j.spec?.recipe?.runId === run.id) : []
  const video = mode === 'video'
  const text = video ? s.current.text : itext
  const setText = (v) => (video ? s.patch(s.active, { text: v }) : setItext(v))
  const model = video ? vmodel : imodel
  const caps = vmodel.caps
  const styled = kit.apply && Boolean(style)
  const attached = useMemo(() => labelAttachments(att, assets), [att, assets])
  const ref = useMemo(() => resolveAttachments({ attached, texts: video ? s.plans.map((p) => p.text) : [itext], caps }), [attached, s.plans, itext, video, caps])
  const roles = Object.fromEntries(ref.items.map((i) => [i.token, i.role]))
  const items = attached.map((x) => ({ key: x.id, token: x.token, label: x.token, sub: x.asset.name, asset: x.asset }))
  const native = Boolean(caps.references) // le modèle prolonge ou modifie lui-même une vidéo jointe
  const activeTask = native ? task : 'refs'
  const clipSecs = ref.references.filter((r) => r.kind === 'video').reduce((n, r) => n + (r.asset.secs || 0), 0) // durée des vidéos jointes : facturée en entrée
  const secs = activeTask === 'edit' ? Math.max(4, Math.ceil(clipSecs)) : s.total // modifier : la sortie dure autant que la vidéo
  const cost = video ? (native ? videoCost(vmodel, secs, s.res, { inputSecs: clipSecs }) : s.cost) : imageCost(imodel, iRes2, iN)
  const busy = recipe ? Boolean(run) : jobs.some((j) => j.kind === mode)

  // Ce qui manque pour lancer, dit en clair sous le texte.
  const needsStart = video && caps.startFrame === 'required' && !ref.slots.start
  const needsClip = video && native && activeTask !== 'refs' && !attached.some((x) => x.asset.kind === 'video')
  const needs = needsClip ? `Joignez une vidéo avec + : elle sera ${activeTask === 'next' ? 'prolongée' : 'modifiée'}.` : needsStart && text.trim() ? 'Ce modèle part d’une image : ajoutez-en une avec +.' : null // l'image est réclamée une fois que l'on a commencé à écrire
  const idle = video && attached.length > 0 && ref.items.every((i) => i.role === 'unused') ? 'Ce modèle n’utilise pas ces références.' : null
  const planHint = video && s.multi && s.plans.findIndex((p) => !p.text.trim()) >= 0 && s.current.text.trim() ? `Décrivez aussi le plan ${s.plans.findIndex((p) => !p.text.trim()) + 1}.` : null
  const emptyPlan = video ? s.plans.findIndex((p) => !p.text.trim()) : (itext.trim() ? -1 : 0) // premier plan sans texte
  const blocked = emptyPlan >= 0 || needsStart || needsClip
  const long = text.length > 600 ? `${text.length.toLocaleString('fr-FR')} caractères` : null // information : les modèles coupent ou ignorent les prompts très longs

  const attach = (list) => setAtt((x) => [...x, ...list.filter((a) => !x.some((y) => y.assetId === a.id)).map((a) => ({ id: crypto.randomUUID(), assetId: a.id }))])
  const detach = (id) => {
    const gone = attached.find((x) => x.id === id)
    setAtt((x) => x.filter((y) => y.id !== id))
    const drop = (t) => t.replace(new RegExp(`@${gone.token}(?!\\d) ?`, 'g'), '') // une pièce retirée ne reste pas citée
    if (gone) { if (video) s.plans.forEach((p, i) => s.patch(i, { text: drop(p.text) })); else setItext(drop) }
  }

  const generate = async () => {
    setError('')
    if (!video) {
      const live = { kind: 'image', modelId: imodel.id, prompt: text.trim(), resolution: iRes2, ratio: iRatio, count: iN, brandStyle: styled ? style : undefined }
      const r = submit({ kind: 'image', title: imodel.name, prompt: text.trim(), count: iN, cost, live, brandStyle: styled ? style : undefined, meta: `${iN} × ${iRes2}${iRatio === 'Auto' ? '' : ` · ${iRatio}`}${styled ? ' · style de la marque' : ''}` })
      return setError(r.ok ? '' : `Solde insuffisant : il manque ${jetons(r.missing)} jetons.`)
    }
    // Vidéo : les pièces jointes deviennent références (Seedance), image de départ, image de fin, audio ou éléments selon le modèle.
    let extra
    try {
      const get = (a) => (a ? getFile(a) : null)
      const [start, end, audio] = await Promise.all([get(ref.slots.start), get(ref.slots.end), get(ref.slots.audio)])
      const elements = await Promise.all(ref.elements.map(async (a) => ({ kind: a.kind, file: await getFile(a) })))
      const references = await Promise.all(ref.references.map(async (r) => ({ kind: r.kind, file: await getFile(r.asset) })))
      extra = { start, end, audio, elements, references }
    } catch {
      return setError('Une référence est introuvable : réimportez-la ou retirez-la.')
    }
    const total = Math.round(secs * 10) / 10
    const live = {
      kind: 'video', modelId: vmodel.id, plans: s.plans.map((p, i) => ({ text: ref.texts[i], dur: p.dur })), secs: total,
      resolution: s.resolutions ? s.res : undefined, ratio: s.ratios ? s.ratio : undefined, fps: caps.fps ? s.fps : undefined, sound: s.sound, camera: 'none',
      brandStyle: styled ? style : undefined,
      files: { start: caps.startFrame !== 'none' ? extra.start : null, end: caps.endFrame ? extra.end : null, audio: caps.audioRef ? extra.audio : null },
      elements: extra.elements.length ? extra.elements : undefined,
      references: extra.references.length ? extra.references : undefined,
      task: native ? { refs: 'reference', next: 'extension', edit: 'editing' }[activeTask] : undefined,
      inputSecs: clipSecs || undefined,
    }
    const base = `${vmodel.name}${activeTask === 'next' ? ' · suite' : activeTask === 'edit' ? ' · modification' : ''} · ${String(total).replace('.', ',')} s${s.resolutions ? ` · ${s.res}` : ''}`
    const r = submit({ kind: 'video', title: vmodel.name, prompt: s.plans.map((p) => p.text.trim()).join(' / '), cost, secs: total, live, brandStyle: styled ? style : undefined, meta: styled ? `${base} · style de la marque` : base })
    setError(r.ok ? '' : `Solde insuffisant : il manque ${jetons(r.missing)} jetons.`)
  }

  // Suite, Avant, Modifier : ces gestes partent d'une vidéo, ils reprennent l'outil de l'écran Vidéo avec celle que vous avez jointe.
  const fromClip = (id) => {
    if (id === 'refs') return
    const clip = attached.find((x) => x.asset.kind === 'video')
    if (!clip) { toast('Joignez d’abord une vidéo avec +.'); return setPicking('video') }
    sendTo({ target: 'video.edit', tool: id === 'edit' ? 'edit' : 'extend', direction: id === 'prev' ? 'start' : undefined, assetId: clip.asset.id }, id === 'edit' ? 'Vidéo envoyée vers Modifier' : 'Vidéo envoyée vers Modifier · Prolonger')
  }

  // Lance le workflow : un seul envoi ; les photos sont déposées chez le fournisseur par le moteur de générations.
  const runRecipe = async () => {
    setRerror('')
    const r = recipeById(recipeId)
    const cost = recipeCost(recipeId)
    if (cost > balance) return setRerror(`Solde insuffisant : il manque ${jetons(Math.ceil((cost - balance) * 10) / 10)} jetons.`)
    let inputFiles
    try {
      inputFiles = Object.fromEntries(await Promise.all(r.photos.map(async (p) => [p.key, p.list ? [await getFile(photos[p.key])] : await getFile(photos[p.key])])))
    } catch { return setRerror('Une photo est introuvable : choisissez-la de nouveau.') }
    const inputs = r.text ? { [r.text.key]: rtext.trim() } : {}
    const id = crypto.randomUUID()
    const live = { kind: 'workflow', modelId: r.workflow.id, inputs, inputFiles }
    const res = submit({ kind: 'video', title: r.name, prompt: inputs[r.text?.key] || r.blurb, cost, live, recipe: { runId: id, step: 0, label: r.name }, meta: r.name })
    if (!res.ok) return setRerror(`Solde insuffisant : il manque ${jetons(res.missing)} jetons.`)
    setRun({ id, recipeId })
  }
  const pickPhoto = (list) => {
    const imgs = list.filter((a) => a.kind === 'image')
    if (!imgs.length) return toast('Choisissez une image.')
    const keys = recipeById(recipeId).photos.map((p) => p.key)
    const free = keys.filter((k) => !photos[k])
    const targets = free.length ? free : keys // tout est rempli : on remplace en repartant de la première
    setPhotos((x) => ({ ...x, ...Object.fromEntries(targets.slice(0, imgs.length).map((k, i) => [k, imgs[i]])) }))
  }

  const modelItems = video ? VIDEO_ITEMS : IMAGE_ITEMS
  const modelValue = video ? videoId : imageId
  const onModel = video ? setVideoId : setImageId
  const logo = logoFor(model.id)
  const durations = s.picks.map((d) => ({ id: d, title: `${d} s` }))

  return (
    <div className={`cn${collapsed ? ' min' : ''}`}>
      <SkipLink />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mode={mode} onMode={changeMode} />

      <main className={`cn-main${busy ? ' busy' : ''}`} id="main" tabIndex={-1}>
        <div className="cn-stage">
          <h1 className={busy ? 'sr-only' : 'cn-h1'}>{recipe ? 'Choisissez une recette' : 'Racontez vos histoires'}</h1>
          {recipe && busy && <RunStrip jobs={runJobs} onDone={() => { setRun(null); pickRecipe(RECIPES[0].id) }} />}
          {recipe && !busy ? <RecipeCards value={recipeId} onPick={pickRecipe} /> : busy ? <GenerationTray kind={recipe ? 'video' : mode} className="cn-tray" /> : <HeroStack />}
        </div>

        <div className="cn-dock">
          {recipe ? (recipeId && !busy && (
            <RecipeForm id={recipeId} text={rtext} onText={(t) => { setRtext(t); setRerror('') }} photos={photos} onAdd={() => setPicking('photo')} onRemove={(k) => setPhotos((x) => ({ ...x, [k]: undefined }))} onPick={pickRecipe} error={rerror} onRun={runRecipe} />
          )) : (
          <div className="cn-comp">
            {video && attached.length > 0 && (
              <ul className="cn-strip" aria-label="Références jointes">
                {attached.map((x) => (
                  <li key={x.id} className={roles[x.token] === 'unused' ? 'off' : undefined}>
                    <button type="button" className="cn-th" onClick={() => area.current?.insertAt(x.token)} aria-label={`Citer ${x.token} (${x.asset.name}) dans le texte`} title={roles[x.token] === 'unused' ? `${x.token} : non utilisé par ce modèle` : x.token}>
                      <AssetThumb asset={x.asset} />
                      <span className="cn-no" aria-hidden="true">{x.token.replace(/^\S+ /, '')}</span>
                    </button>
                    <button type="button" className="cn-rm" onClick={() => detach(x.id)} aria-label={`Retirer ${x.token}`}><Icon name="close" size={11} /></button>
                  </li>
                ))}
              </ul>
            )}

            {video && caps.multiShot && <div className="cn-plans"><PlanTabs s={s} controls="cn-plan" headingId="cn-plan-h" /></div>}
            <div className="cn-edit">
              <div className="cn-field" id="cn-plan" role={video && s.multi ? 'tabpanel' : undefined} aria-labelledby={video && s.multi ? `plan-tab-${s.active}` : undefined}>
                <MentionTextarea
                  ref={area}
                  value={text}
                  onChange={(t) => { setText(t); setError('') }}
                  items={video ? items : []}
                  pattern={ATTACH_PATTERN}
                  isRef={(t) => attached.some((x) => x.token === t)}
                  roles={roles}
                  emptyHint="Joignez des fichiers avec + : vous pourrez les citer ici."
                  placeholder={video ? (s.multi ? `Décrivez le plan ${s.active + 1}. Tapez @ pour citer une référence jointe.` : 'Décrivez la scène. Tapez @ pour citer une référence jointe.') : 'Décrivez l’image que vous imaginez.'}
                  aria-label={video && s.multi ? `Plan ${s.active + 1}` : 'Description'}
                  rows={3}
                  data-prompt
                />
                {(error || needs || planHint || idle || long) && <p className={`cn-hint${error ? ' bad' : ''}`} role={error ? 'alert' : 'status'}>{error || needs || planHint || idle || long}</p>}
              </div>
              <button type="button" className="cn-gen" disabled={blocked} onClick={generate} title={needs ?? (emptyPlan >= 0 ? (s.multi ? `Décrivez le plan ${emptyPlan + 1}` : 'Décrivez d’abord la scène') : (video && caps.startFrame === 'required' && !ref.slots.start ? 'Ajoutez une image avec +' : undefined))}>
                <b>Générer</b><span><Icon name="sparkle" size={14} />{jetons(cost)}</span>
              </button>

              <div className="cn-bar">
                {video && (
                  <div className="cn-pair">
                    <button type="button" onClick={() => setPicking('recent')} aria-label="Ajouter des références" title="Ajouter des références"><Icon name="plus" size={18} /></button>
                    <i aria-hidden="true" />
                    <button type="button" onClick={() => area.current?.insertAt()} aria-label="Citer une référence" title="Citer une référence"><Icon name="at" size={18} /></button>
                  </div>
                )}
                <Menu items={modelItems} value={modelValue} onChange={onModel} label={video ? 'Modèle vidéo' : 'Modèle image'} menuWidth={460} search="Rechercher un modèle…" className="cn-chip cn-model" listClass="cn-pop">
                  {logo ? <ModelLogo logo={logo} size={18} /> : <Icon name="sparkle" size={16} />}<span>{model.name}</span>
                </Menu>
                {video && (
                  <Menu items={native ? MODES.filter((m) => m.id !== 'prev') : MODES} value={activeTask} onChange={native ? setTask : fromClip} label="Mode de création" menuWidth={240} className="cn-chip" listClass="cn-pop">
                    <Icon name={MODES.find((m) => m.id === activeTask).icon} size={16} /><span>{MODES.find((m) => m.id === activeTask).title}</span>
                  </Menu>
                )}

                <ChipScroll>
                  {video ? (
                    <>
                      {s.ratios ? (
                        <Menu items={s.ratios.map((r) => ({ id: r, title: r === 'auto' ? 'Auto' : r }))} value={s.ratio} onChange={s.setRatio} label="Format" menuWidth={160} className="cn-chip" listClass="cn-pop"><Icon name="screen" size={16} /><span>{s.ratio === 'auto' ? 'Auto' : s.ratio}</span></Menu>
                      ) : (
                        <button type="button" className="cn-chip" disabled title="Le format suit l’image de départ"><Icon name="screen" size={16} /><span>Auto</span></button>
                      )}
                      {s.resolutions && (
                        <Menu items={s.resolutions.map((r) => ({ id: r, title: r }))} value={s.res} onChange={s.setRes} label="Résolution" menuWidth={160} className="cn-chip" listClass="cn-pop"><Icon name="diamond" size={16} /><span>{s.res}</span></Menu>
                      )}
                      {durations.length > 0 && activeTask !== 'edit' && (
                        <Menu items={durations} value={s.current.dur} onChange={(d) => s.patch(s.active, { dur: d })} label={s.multi ? `Durée du plan ${s.active + 1}` : 'Durée'} menuWidth={160} className="cn-chip" listClass="cn-pop"><Icon name="clock" size={16} /><span>{s.current.dur} s{s.multi ? ` · ${Math.round(s.total * 10) / 10} s au total` : ''}</span></Menu>
                      )}
                      {s.soundMode !== 'provided' && (
                        <button type="button" className="cn-chip icon" aria-pressed={s.sound} aria-label="Son" disabled={s.soundMode === 'always'} onClick={() => s.setSound((v) => !v)} title={s.soundMode === 'always' ? 'Ce modèle génère toujours le son' : s.sound ? 'Son activé : cliquer pour le couper' : 'Son coupé : cliquer pour l’activer'}><Icon name={s.sound ? 'sound' : 'mute'} size={16} /></button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" className="cn-chip" onClick={() => setIRatio((r) => nextOf(imodel.caps.ratios, r))} aria-label={`Format : ${iRatio}`}><Icon name="screen" size={16} /><span>{iRatio}</span></button>
                      <button type="button" className="cn-chip" disabled={imodel.caps.resolutions.length < 2} onClick={() => setIRes(nextOf(imodel.caps.resolutions, iRes2))} aria-label={`Résolution : ${iRes2}`}><Icon name="diamond" size={16} /><span>{iRes2}</span></button>
                      <span className="cn-step" role="group" aria-label="Nombre d’images">
                        <button type="button" onClick={() => setICount((c) => Math.max(1, c - 1))} aria-label="Moins" disabled={iN <= 1}>−</button>
                        <b>{iN}/{imodel.caps.maxImages}</b>
                        <button type="button" onClick={() => setICount((c) => Math.min(imodel.caps.maxImages, c + 1))} aria-label="Plus" disabled={iN >= imodel.caps.maxImages}>+</button>
                      </span>
                    </>
                  )}
                  <BrandToggle className="cn-chip icon" iconOnly />
                </ChipScroll>
              </div>
            </div>
          </div>
          )}
        </div>
      </main>

      <AssetModal open={Boolean(picking)} initialSub={picking === 'video' ? 'video' : 'recent'} taken={att.map((x) => x.assetId)} onClose={() => setPicking(null)} onAdd={picking === 'photo' ? pickPhoto : attach} />
    </div>
  )
}
