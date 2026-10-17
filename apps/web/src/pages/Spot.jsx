import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { gradient } from '../lib/gradients.js'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import Menu from '../components/Menu.jsx'
import PromoBar from '../components/PromoBar.jsx'
import { Section, DropTile } from '../components/GenPanel.jsx'
import SpotPlayer from '../components/SpotPlayer.jsx'
import Segment from '../components/Segment.jsx'
import EndCard from '../components/EndCard.jsx'
import { brandSet, brandVars, useBrand, useLogoUrl } from '../lib/brand.jsx'
import { useAssets } from '../lib/assets.jsx'
import { jetonLabel, jetons, useJobs } from '../lib/jobs.jsx'
import { endCardPng } from '../lib/media.js'
import { STAGES, useSpots } from '../lib/spots.jsx'
import { FCFA_PER_JETON, LANGS, TONES, VOICES, digits, estimate, ffmpegCommand, srtOf, validateBrief, writeScript, voiceSecs } from '@studio/spot'
import { useToast } from '../lib/toasts.jsx'
import useTabKeys from '../lib/useTabKeys.js'
import '../styles/shell.css'
import '../styles/video.css'
import '../styles/library.css'
import '../styles/edit-panel.css'
import '../styles/spot.css'

const BLANK = { name: '', offer: '', price: '', whatsapp: '', tone: 'warm', lang: 'fr', voice: 'Rachel' }
const LINE_LABELS = ['Accroche', 'Message', 'Appel à l’action']
const STEPS = [
  { id: 'act', label: 'Activité', hint: 'Dites-nous qui vous êtes et ce que vous vendez.', fields: ['name', 'offer', 'whatsapp'] },
  { id: 'style', label: 'Style', hint: 'Choisissez le ton, la langue et la voix.', fields: [] },
  { id: 'script', label: 'Script', hint: 'Relisez le texte lu par la voix, puis lancez la création.', fields: ['script'] },
]
const STAGE_LABEL = { image: 'Visuel du produit', voice: 'Voix off', video: 'Animation vidéo', montage: 'Montage et sous-titres' }

const download = (blob, name) => {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Aperçu avant génération : le script et la carte finale telles qu'elles apparaîtront, mises à jour en direct. */
function Storyboard({ brief, lines, busy, progress, colors, logoUrl }) {
  return (
    <div className="spp">
      <div className="spp-screen sb" style={brandVars(colors)}>
        <ol className="sb-lines">
          {lines.map((l, i) => <li key={i}><span>{i + 1}</span>{l || '…'}</li>)}
        </ol>
        <EndCard className="sb-end" title={brief.name.trim() || 'Votre entreprise'} offer={brief.offer.trim() || 'Votre offre en une phrase'} price={brief.price.trim()} whatsapp={brief.whatsapp.trim()} logoUrl={logoUrl} />
        {busy && (
          <div className="sb-busy" aria-hidden="true">
            <i className="gx-spin" />
            <b>{Math.round(progress)} %</b>
            <span>Création du spot…</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Spot() {
  useDocumentTitle('Spot pub')
  const { run, start, retry, cancel, reset } = useSpots()
  const { jobs, balance } = useJobs()
  const { assets, getFile } = useAssets()
  const toast = useToast()
  const { brand, colors, style } = useBrand()
  const logoUrl = useLogoUrl(brand.logoId)
  const [brief, setBrief] = useState(() => ({ ...BLANK, name: brand.name, whatsapp: brand.whatsapp, tone: brand.tone, lang: brand.lang, voice: brand.voice }))
  const [variant, setVariant] = useState(0)
  const [edited, setEdited] = useState(false)
  const [lines, setLines] = useState(() => writeScript({ ...BLANK, name: brand.name, tone: brand.tone, lang: brand.lang }, 0))
  const [photoId, setPhotoId] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [touched, setTouched] = useState({})
  const [step, setStep] = useState(0)
  const [visited, setVisited] = useState(() => new Set([0]))
  const onTabKeys = useTabKeys()

  useEffect(() => { if (!edited) setLines(writeScript(brief, variant)) }, [brief.name, brief.offer, brief.price, brief.tone, brief.lang, variant, edited]) // eslint-disable-line react-hooks/exhaustive-deps

  const photo = photoId ? assets.find((a) => a.id === photoId) : null
  const errors = validateBrief(brief, lines)
  const est = useMemo(() => estimate(lines, Boolean(photo)), [lines, photo])
  const active = run && (run.status === 'running' || run.status === 'blocked')
  const result = run?.resultAssetId ? assets.find((a) => a.id === run.resultAssetId) : null
  const voiceAsset = run?.stages.voice.assetId ? assets.find((a) => a.id === run.stages.voice.assetId) : null
  const short = est.total - balance
  const set = (k) => (e) => setBrief((b) => ({ ...b, [k]: e.target.value }))
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  const err = (k) => (touched[k] || touched.all) && errors[k]

  // Annonce vocale : un message par changement d'étape (jamais le pourcentage, qui change quatre fois par seconde).
  const announce = !run ? '' : run.status === 'done' ? 'Spot terminé.'
    : run.status === 'canceled' ? 'Création annulée.'
      : STAGES.some((k) => run.stages[k].status === 'failed') ? 'Une étape a échoué. Vous pouvez la réessayer.'
        : STAGES.some((k) => run.stages[k].blocked) ? 'Création en pause : solde insuffisant.'
          : `Création en cours : ${STAGES.filter((k) => run.stages[k].status === 'running').map((k) => STAGE_LABEL[k]).join(', ') || 'préparation'}.`

  const progress = useMemo(() => {
    if (!run) return 0
    const live = STAGES.filter((k) => run.stages[k].status !== 'skipped')
    const sum = live.reduce((s, k) => {
      const st = run.stages[k]
      if (st.status === 'done') return s + 100
      const job = st.status === 'running' ? jobs.find((j) => j.id === st.jobId) : null
      return s + (job ? job.progress : 0)
    }, 0)
    return sum / live.length
  }, [run, jobs])

  // Une étape est « faite » quand elle a été vue et que ses champs sont valides.
  const stepBad = (i) => STEPS[i].fields.some((f) => errors[f])
  const stepDone = (i) => visited.has(i) && i !== step && !stepBad(i)
  const go = (i, focus = true) => {
    setStep(i)
    setVisited((v) => new Set(v).add(i))
    document.querySelector('.lp')?.scrollTo({ top: 0 })
    if (focus) setTimeout(() => document.querySelector('#spot-panel input:not([type=file]), #spot-panel textarea, #spot-panel [role=radio]')?.focus(), 0)
  }
  const firstBad = () => STEPS.findIndex((_, i) => stepBad(i))
  const focusInvalid = () => setTimeout(() => document.querySelector('#spot-panel [aria-invalid="true"]')?.focus(), 0)

  const advance = () => {
    if (stepBad(step)) { setTouched((t) => ({ ...t, all: true })); focusInvalid(); return }
    go(step + 1)
  }
  const launch = () => {
    setTouched((t) => ({ ...t, all: true }))
    const bad = firstBad()
    if (bad >= 0) { go(bad, false); focusInvalid(); return }
    if (short > 0) return
    start({ brief, lines, productAssetId: photoId, brand: { apply: brand.apply, style, colors, logoId: brand.logoId } })
  }

  const share = async () => {
    const m = result.spot
    const text = `${m.title} — ${m.endCard.offer}\nÉcrivez-nous sur WhatsApp : https://wa.me/${m.endCard.whatsapp}`
    try {
      const file = await getFile(result)
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return }
    } catch { /* repli ci-dessous */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const exportItems = [
    { id: 'video', icon: 'vid', title: 'Vidéo du spot (.mp4)' },
    { id: 'voice', icon: 'sound', title: 'Voix off (.wav)' },
    { id: 'srt', icon: 'book', title: 'Sous-titres (.srt)' },
    { id: 'card', icon: 'img', title: 'Carte finale (.png)' },
    { id: 'plan', icon: 'layers', title: 'Plan de montage (.json)' },
  ]
  const exportOne = async (id) => {
    const m = result.spot
    const slug = m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spot'
    try {
      if (id === 'video') { const f = await getFile(result); download(f, `${slug}.mp4`) }
      else if (id === 'voice') { if (!voiceAsset) throw new Error(); download(await getFile(voiceAsset), `${slug}-voix.wav`) }
      else if (id === 'srt') download(new Blob([srtOf(m.captions)], { type: 'text/plain' }), `${slug}.srt`)
      else if (id === 'card') {
        const logo = m.brand?.logoId ? assets.find((a) => a.id === m.brand.logoId) : null
        download(await endCardPng(m, logo ? await getFile(logo).catch(() => null) : null), `${slug}-carte-finale.png`)
      }
      else download(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }), `${slug}-plan.json`)
    } catch { toast('Téléchargement impossible : fichier introuvable.') }
  }

  const costLine = `≈ ${Math.round(est.total * FCFA_PER_JETON).toLocaleString('fr-FR')} FCFA`
  const langItems = LANGS.map((l) => ({ id: l.id, title: l.label }))
  const voiceItems = VOICES.map((v) => ({ id: v.id, title: `Voix · ${v.label}` }))

  return (
    <div className="pg shell video spot">
      <SkipLink />
      <PromoBar seconds={2 * 3600 + 53 * 60 + 15} cta="Obtenir 50 % de remise">
        Génération illimitée sur les formules Max. Remise personnelle de 50 %
      </PromoBar>
      <ShellHeader />

      <main className="app" id="main" tabIndex={-1}>
        <p className="sr-only" role="status">{announce}</p>
        <aside className="lp">
          <div className="tabs" role="tablist" aria-label="Étapes du spot" onKeyDown={onTabKeys}>
            {STEPS.map((st, i) => (
              <button key={st.id} id={`spt-${i}`} type="button" role="tab" aria-selected={step === i} aria-controls="spot-panel" tabIndex={step === i ? 0 : -1} className={step === i ? 'on' : ''} onClick={() => go(i, false)}>
                <span className={`st-n${stepDone(i) ? ' ok' : ''}`} aria-hidden="true">{stepDone(i) ? <Icon name="check" size={11} /> : i + 1}</span>
                {st.label}
                {stepDone(i) && <span className="sr-only"> (terminée)</span>}
              </button>
            ))}
          </div>

          <form className="ep" role="tabpanel" id="spot-panel" aria-labelledby={`spt-${step}`} onSubmit={(e) => { e.preventDefault(); step < STEPS.length - 1 ? advance() : launch() }} noValidate>
            <div className="mc" style={{ background: gradient(9, 'video') }}>
              <h1>Spot pub</h1>
              <span>Étape {step + 1} sur {STEPS.length} · {STEPS[step].hint}</span>
            </div>

            <fieldset disabled={active} className="ep-fs">
              {step === 0 && (
                <>
                  <p className="ep-note sp-brandnote">
                    {brandSet(brand)
                      ? <>Votre marque est appliquée : {brand.name}. <Link to="/brand">Modifier</Link></>
                      : <>Gagnez du temps : enregistrez votre nom, votre WhatsApp, votre logo et vos couleurs une seule fois. <Link to="/brand">Créer ma marque</Link></>}
                  </p>
                  <Section id="sp-act" title="Votre activité">
                    <label className="ep-field">
                      <span>Nom de l’entreprise</span>
                      <input value={brief.name} onChange={set('name')} onBlur={blur('name')} placeholder="Ex. Chez Maman Awa" aria-invalid={err('name') ? true : undefined} aria-describedby={err('name') ? 'e-name' : undefined} autoComplete="organization" />
                      {err('name') && <em id="e-name" role="alert">{errors.name}</em>}
                    </label>
                    <label className="ep-field">
                      <span>Ce que vous proposez</span>
                      <textarea rows={2} value={brief.offer} onChange={set('offer')} onBlur={blur('offer')} placeholder="Ex. des beignets frais tous les matins, livrés à domicile" aria-invalid={err('offer') ? true : undefined} aria-describedby={err('offer') ? 'e-offer' : undefined} />
                      {err('offer') && <em id="e-offer" role="alert">{errors.offer}</em>}
                    </label>
                    <label className="ep-field">
                      <span>Prix ou promotion <small>facultatif</small></span>
                      <input value={brief.price} onChange={set('price')} placeholder="Ex. 500 FCFA la part" />
                    </label>
                    <label className="ep-field">
                      <span>WhatsApp</span>
                      <input type="tel" inputMode="tel" value={brief.whatsapp} onChange={set('whatsapp')} onBlur={blur('whatsapp')} placeholder="+226 70 12 34 56" aria-invalid={err('whatsapp') ? true : undefined} aria-describedby={err('whatsapp') ? 'e-wa' : undefined} autoComplete="tel" />
                      {err('whatsapp') && <em id="e-wa" role="alert">{errors.whatsapp}</em>}
                    </label>
                  </Section>

                  <Section id="sp-ph" title="Photo du produit">
                    <div className="ep-tiles one">
                      <DropTile icon="img" label={photo ? photo.name : 'Votre photo'} accept="image/*" file={photoFile} onFile={(f, a) => { setPhotoFile(f); setPhotoId(a?.id ?? null) }} />
                    </div>
                    <p className="ep-note">{photo ? 'Le spot anime votre photo.' : 'Facultatif : sans photo, on crée le visuel à partir de votre description.'}</p>
                  </Section>
                </>
              )}

              {step === 1 && (
                <>
                  <Section id="sp-tone" title="Ton">
                    <Segment label="Ton" value={brief.tone} onChange={(v) => setBrief((b) => ({ ...b, tone: v }))} options={TONES} />
                    <p className="ep-note">{{ warm: 'Proche et rassurant : idéal pour un commerce de quartier.', bold: 'Énergique et direct : pour une promo ou un lancement.', premium: 'Sobre et élégant : pour une marque haut de gamme.' }[brief.tone]}</p>
                  </Section>
                  <Section id="sp-voice" title="Langue et voix">
                    <div className="ep-pair even">
                      <Menu items={langItems} value={brief.lang} onChange={(v) => setBrief((b) => ({ ...b, lang: v }))} label="Langue" menuWidth={200}>
                        <span className="ep-ell">{LANGS.find((l) => l.id === brief.lang).label}</span>
                      </Menu>
                      <Menu items={voiceItems} value={brief.voice} onChange={(v) => setBrief((b) => ({ ...b, voice: v }))} label="Voix" menuWidth={220}>
                        <Icon name="sound" size={16} /><span className="ep-ell">{VOICES.find((v) => v.id === brief.voice).label}</span>
                      </Menu>
                    </div>
                    <p className="ep-note">Le script est écrit dans la langue choisie ; vous pourrez le modifier à l’étape suivante.</p>
                  </Section>
                </>
              )}

              {step === 2 && (
                <>
                  <Section id="sp-script" title="Script">
                    {lines.map((l, i) => (
                      <label key={i} className="ep-field">
                        <span>{LINE_LABELS[i]}</span>
                        <textarea rows={2} value={l} onChange={(e) => { setEdited(true); setLines((ls) => ls.map((x, k) => (k === i ? e.target.value : x))) }} aria-invalid={errors.script && !l.trim() && touched.all ? true : undefined} />
                      </label>
                    ))}
                    {errors.script && touched.all && <em role="alert" className="ep-err">{errors.script}</em>}
                    <div className="ep-pfoot sp-sbar">
                      <span>≈ {voiceSecs(lines)} s de voix{est.secs > 12 ? ' · plus court = moins cher' : ''}</span>
                      <button type="button" className="ep-chip" onClick={() => { setEdited(false); setVariant((v) => v + 1) }}><Icon name="revert" size={15} />Réécrire</button>
                    </div>
                  </Section>
                  <div className="ep-opts three">
                    <button type="button" className="ep-chip" disabled title="Format vertical, fixe pour WhatsApp" aria-label="Format : 9:16"><Icon name="screen" size={16} />9:16</button>
                    <button type="button" className="ep-chip" disabled title="Durée calculée d’après la voix" aria-label={`Durée : ${est.secs} secondes`}><Icon name="clock" size={16} />{est.secs} s</button>
                    <button type="button" className="ep-chip" disabled title="Résolution fixe" aria-label="Résolution : 720p"><Icon name="upscale" size={16} />720p</button>
                  </div>
                </>
              )}
            </fieldset>

            <div className="ep-gen">
              {short > 0 && step === STEPS.length - 1 && <p className="ep-gerr" role="alert">Solde insuffisant : il manque {jetons(short)} jetons.</p>}
              {step === STEPS.length - 1 && (
                <details className="sp-cost">
                  <summary>Détail du coût · {costLine}</summary>
                  <ul>{est.parts.map((p) => <li key={p.id}><span>{p.label}</span><b>{jetons(p.cost)}</b></li>)}</ul>
                </details>
              )}
              {step > 0 && !active && <button type="button" className="sp-back" onClick={() => go(step - 1, false)}><Icon name="chevL" size={14} />Retour</button>}
              {active ? (
                <button type="button" className="gen" onClick={cancel}>Annuler la création</button>
              ) : step < STEPS.length - 1 ? (
                <button type="submit" className="gen">Continuer<span>{STEPS[step + 1].label}<Icon name="chevR" size={16} /></span></button>
              ) : (
                <button type="submit" className="gen" disabled={short > 0}>
                  {run?.status === 'done' ? 'Créer un autre spot' : 'Créer le spot'}<span><Icon name="sparkle" size={16} />{jetons(est.total)}</span>
                </button>
              )}
            </div>
          </form>
        </aside>

        <section className="mp" aria-label="Aperçu du spot">
          <div className="pl">
            <Link to="/library"><Icon name="folder" size={15} />Bibliothèque</Link>
            {run && <button type="button" onClick={reset}>Effacer l’aperçu</button>}
          </div>

          <div className="sp-stage">
            {run?.status === 'done' && result?.spot ? <SpotPlayer manifest={result.spot} /> : <Storyboard brief={brief} lines={lines} busy={Boolean(active)} progress={progress} colors={colors} logoUrl={logoUrl} />}

            {run && run.status !== 'done' && (
              <ol className="sp-pipe" aria-label="Avancement">
                {STAGES.map((k) => {
                  const s = run.stages[k]
                  const job = s.status === 'running' ? jobs.find((j) => j.id === s.jobId) : null
                  return (
                    <li key={k} className={`st-${s.status}`}>
                      <span className="sp-dot" aria-hidden="true">{s.status === 'done' || s.status === 'skipped' ? <Icon name="check" size={13} /> : s.status === 'failed' ? <Icon name="alert" size={13} /> : s.status === 'running' ? <i className="gx-spin" /> : null}</span>
                      <div>
                        <p><b>{STAGE_LABEL[k]}</b><span>{s.status === 'skipped' ? 'Votre photo' : { waiting: 'En attente', running: job?.status === 'IN_QUEUE' ? 'En file' : 'En cours', done: 'Terminé', failed: 'Échec' }[s.status]}</span></p>
                        {job && job.status === 'IN_PROGRESS' && <div className="gx-bar" role="progressbar" aria-label={STAGE_LABEL[k]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress)}><i style={{ transform: `scaleX(${job.progress / 100})` }} /></div>}
                        {s.error && <p className="ch-err" role="alert">{s.error}</p>}
                        {(s.status === 'failed' || s.blocked) && <button type="button" className="lb-btn main" onClick={() => retry(k)}>{s.blocked ? 'Reprendre' : 'Réessayer cette étape'}</button>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}

            {run?.status === 'done' && result && (
              <div className="sp-actions">
                <button type="button" className="lb-btn main" onClick={share}><Icon name="send" size={16} />Partager sur WhatsApp</button>
                <Menu items={exportItems} value={null} onChange={exportOne} label="Télécharger" menuWidth={260} heading="Télécharger" className="lb-menu">
                  <Icon name="download" size={16} /><span>Télécharger</span>
                </Menu>
                <Link className="lb-btn" to={`/library?asset=${encodeURIComponent(result.id)}`}><Icon name="folder" size={16} />Voir dans la bibliothèque</Link>
              </div>
            )}

            {run?.status === 'done' && result?.spot && (
              <details className="ch-json sp-server">
                <summary>Montage côté serveur</summary>
                <div>
                  <p>Cet aperçu est rendu depuis le plan de montage. En production, un worker (Railway) lit ce plan, exécute ffmpeg et dépose le fichier final dans le stockage (R2).</p>
                  <pre tabIndex={0}>{ffmpegCommand(result.spot)}</pre>
                </div>
              </details>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
