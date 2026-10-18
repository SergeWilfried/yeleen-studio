import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useEffect, useRef, useState } from 'react'
import Icon from '../lib/icons.jsx'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import useTabKeys from '../lib/useTabKeys.js'
import GenerationTray from '../components/GenerationTray.jsx'
import Menu from '../components/Menu.jsx'
import { jetons, useJobs } from '../lib/jobs.jsx'
import { AUDIO_MODELS, findModel, priceLabel, voiceCost } from '@studio/catalog'
import { VOICES, findVoice } from '@studio/catalog/voices'
import ThumbCarousel from '../components/ThumbCarousel.jsx'
import { useBrand } from '../lib/brand.jsx'
import { synthWav } from '../lib/media.js'
import { apiEnabled } from '../lib/api.js'
import { modelItem } from '../lib/modelItem.js'
import { logoFor } from '../lib/modelLogos.js'
import { flagFor } from '../lib/flags.js'
import Flag from '../components/Flag.jsx'
import ModelLogo from '../components/ModelLogo.jsx'
import PromoBar from '../components/PromoBar.jsx'
import '../styles/shell.css'
import '../styles/audio.css'

// Avatar d'une voix : un dégradé de teinte propre à chaque voix (repère visuel, pas un portrait).
const avatar = (i) => `radial-gradient(circle at 40% 30%,hsl(${(i * 47 + 18) % 360} 55% 72%),hsl(${(i * 47 + 18) % 360} 45% 26%) 72%)`
const TABS = ['Texte en voix', 'Changer de voix', 'Traduire']
const LANGUAGES = [
  { id: 'auto', title: 'Détection automatique' }, { id: 'fr', title: 'Français' }, { id: 'en', title: 'Anglais' },
  { id: 'es', title: 'Espagnol' }, { id: 'pt', title: 'Portugais' }, { id: 'de', title: 'Allemand' }, { id: 'ar', title: 'Arabe' },
]
const NORMALIZATION = [
  { id: 'auto', title: 'Automatique', desc: 'Le modèle décide d’épeler ou non les nombres et les sigles.' },
  { id: 'on', title: 'Activée', desc: 'Toujours épeler les nombres, dates et abréviations.' },
  { id: 'off', title: 'Désactivée', desc: 'Lire le texte tel quel.' },
]

export default function Audio() {
  useDocumentTitle('Audio')
  const [tab, setTab] = useState(TABS[0])
  const { brand } = useBrand()
  const [voiceId, setVoiceId] = useState(() => findVoice(brand.voice).id) // la voix du kit de marque, sinon la première
  const voice = findVoice(voiceId)
  const voiceIdx = VOICES.findIndex((v) => v.id === voiceId)
  const [previewing, setPreviewing] = useState(false)
  const sample = useRef(null)
  const stopSample = () => { sample.current?.pause(); if (sample.current) URL.revokeObjectURL(sample.current.src); sample.current = null; setPreviewing(false) }
  const togglePreview = () => {
    if (previewing) return stopSample()
    const el = new window.Audio(URL.createObjectURL(synthWav(voiceIdx * 3 + 1, 3))) // échantillon simulé : un son par voix
    el.onended = stopSample
    sample.current = el
    el.play().then(() => setPreviewing(true)).catch(stopSample)
  }
  useEffect(() => stopSample, []) // eslint-disable-line react-hooks/exhaustive-deps
  const pickVoice = (id) => { if (previewing) stopSample(); setVoiceId(id) }
  const [count, setCount] = useState(1)
  const [script, setScript] = useState('')
  const onTabKeys = useTabKeys()
  const { submit } = useJobs()
  const [error, setError] = useState('')
  const [modelId, setModelId] = useState(AUDIO_MODELS[0].id)
  const model = findModel(AUDIO_MODELS, modelId)
  const has = (p) => model.caps.params.includes(p)
  const [stability, setStability] = useState(0.5)
  const [language, setLanguage] = useState(() => (LANGUAGES.some((l) => l.id === brand.lang) ? brand.lang : 'auto')) // langue du kit de marque, sinon détection
  const [normalization, setNormalization] = useState('auto')
  const [timestamps, setTimestamps] = useState(false)
  const cost = Math.round(voiceCost(model, script.length) * Math.min(count, apiEnabled ? 1 : 4) * 10) / 10
  const maxOut = apiEnabled ? 1 : 4 // avec le service réel, une sortie par demande
  const modelItems = AUDIO_MODELS.map((m) => modelItem(m, 'audio'))
  const generate = () => {
    const lang = LANGUAGES.find((l) => l.id === language)
    const live = { kind: 'audio', modelId: model.id, prompt: script.trim(), voice: voice.id, language, stability, normalization, timestamps }
    const r = submit({ kind: 'audio', title: model.name, prompt: script.trim(), count: Math.min(count, maxOut), cost, live, secs: Math.max(1, Math.round(script.length / 14)), voice: voice.id, meta: `${voice.label} · ${script.length} caractères${language === 'auto' ? '' : ` · ${lang.title}`}` })
    setError(r.ok ? '' : `Solde insuffisant : il manque ${jetons(r.missing)} jetons.`)
  }

  return (
    <div className="pg shell audio">
      <SkipLink />
      <PromoBar seconds={2 * 3600 + 48 * 60 + 22} cta="Obtenir 50 % de remise">
        Génération illimitée sur les formules Max. Remise personnelle de 50 %
      </PromoBar>
      <ShellHeader />

      <main className="app" id="main" tabIndex={-1}>
        <aside className="lp">
          <div className="tabs" role="tablist" aria-label="Outils audio" onKeyDown={onTabKeys}>
            {TABS.map((t, i) => (
              <button key={t} id={`at-${i}`} type="button" role="tab" aria-selected={tab === t} aria-controls="audio-panel" tabIndex={tab === t ? 0 : -1} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="lp-panel" role="tabpanel" id="audio-panel" aria-labelledby={`at-${TABS.indexOf(tab)}`}>
          <div className="dz">
            <span className="opt">Facultatif</span>
            <div className="dzi">
              <i><Icon name="wave" size={15} /></i><i><Icon name="mus" size={15} /></i><i><Icon name="img" size={15} /></i>
            </div>
            <span style={{ color: '#e6e6e2', fontSize: 15 }}>Importer un média</span>
            <span>Jusqu'à 3 voix, audios ou images</span>
          </div>
          <label className="box" style={{ height: 128 }}>
            <b>Script<Icon name="info" size={15} /></b>
            <textarea
              data-prompt
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Écrivez exactement ce que la voix doit lire à voix haute. Tapez @ pour référencer des pièces jointes."
            />
          </label>
          <Menu items={modelItems} value={modelId} onChange={setModelId} label="Modèle audio" menuWidth={420} search="Rechercher un modèle…" className="am">
            <ModelLogo logo={logoFor(model.id)} size={22} />
            <span className="am-t"><small>Modèle</small><b>{model.name}</b></span>
            <span className="ep-price">{priceLabel(model)}</span>
          </Menu>
          {has('language') && (
            <Menu items={LANGUAGES} value={language} onChange={setLanguage} label="Langue du texte" menuWidth={300} className="am">
              <span className="am-t"><small>Langue du texte</small><b>{LANGUAGES.find((l) => l.id === language).title}</b></span>
            </Menu>
          )}
          <div className="row">
            <b>Nombre de sorties</b>
            <span className="r" style={{ color: '#f2f2ee', fontWeight: 600 }}>
              <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Moins">−</button>
              {Math.min(count, maxOut)}/{maxOut}
              <button type="button" onClick={() => setCount((c) => Math.min(maxOut, c + 1))} aria-label="Plus">+</button>
            </span>
          </div>
          {error && <p className="ep-gerr" role="alert">{error}</p>}
          <button type="button" className="gen" disabled={!script.trim()} onClick={generate}>Générer<span className="gcost"><Icon name="sparkle" size={16} />{jetons(cost)}</span></button>
          </div>
        </aside>

        <section className="mp">
          <div className="bar">
            <a href="#"><Icon name="folder" size={14} />Historique</a>
            <a href="#" style={{ background: '#222326' }}><Icon name="book" size={14} />Comment ça marche</a>
            <a href="#" className="f"><Icon name="filter" size={13} />Filtres</a>
          </div>
          <div className="cv">
            <GenerationTray kind="audio" />
            <div>
              <h1>Convertissez du texte en voix</h1>
              <p className="s">Une voix réaliste à partir de n'importe quel script, prête pour vos projets</p>
            </div>

            <div className="two">
              <div className="cd">
                <h3>Choisissez une voix</h3>
                <p>Faites défiler les voix, écoutez un extrait, puis générez.</p>
                <div className="vpick">
                  <div className="vnow" aria-live="polite">
                    <Flag country={voice.country} size={52} />
                    <div><b>{voice.label}</b><span>{voice.gender === 'f' ? 'Voix féminine' : 'Voix masculine'}{flagFor(voice.country) ? ` · accent ${flagFor(voice.country).accent}` : ''} · {voice.trait}</span></div>
                    <button type="button" className="vplay" onClick={togglePreview} aria-pressed={previewing} aria-label={`${previewing ? 'Arrêter' : 'Écouter'} la voix ${voice.label}`}>
                      <Icon name={previewing ? 'pause' : 'play'} size={16} fill="currentColor" />{previewing ? 'Arrêter' : 'Écouter'}
                    </button>
                  </div>
                  <ThumbCarousel items={VOICES.map((v, i) => ({ id: v.id, label: v.label, poster: `${flagFor(v.country) ? `url("${flagFor(v.country).src}") right 1px bottom 1px / 46% auto no-repeat, ` : ''}${avatar(i)}` }))} value={voiceId} onChange={pickVoice} size={34} loop label="Voix" />
                </div>
              </div>

              <div className="cd">
                <h3>Écrivez, décrivez et générez</h3>
                <p>Saisissez votre script, décrivez le rendu sonore.</p>
                <div className="st">
                  <div className="sg">
                    {has('stability') && (
                      <label className="pm pm-wide">
                        <span className="pm-h">Stabilité<u>{stability.toFixed(2).replace('.', ',')}</u></span>
                        <input type="range" min="0" max="1" step="0.05" value={stability} onChange={(e) => setStability(+e.target.value)} />
                        <small>Plus bas : voix plus expressive. Plus haut : voix plus régulière.</small>
                      </label>
                    )}
                    {has('normalization') && (
                      <Menu items={NORMALIZATION} value={normalization} onChange={setNormalization} label="Normalisation du texte" menuWidth={300} className="pm pm-sel">
                        <span className="pm-t"><small>Normalisation</small><b>{NORMALIZATION.find((l) => l.id === normalization).title}</b></span>
                      </Menu>
                    )}
                    {has('timestamps') && (
                      <button type="button" className="pm pm-wide pm-toggle" aria-pressed={timestamps} onClick={() => setTimestamps((v) => !v)}>
                        <span className="pm-t"><b>Horodatage mot à mot</b><small>Pour les sous-titres synchronisés</small></span>
                        <i className="sw-mini" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <button type="button" className="gn" disabled={!script.trim()} onClick={generate}>Générer <span className="gcost"><Icon name="sparkle" size={15} />{jetons(cost)}</span></button>
                </div>
              </div>
            </div>

            <div className="sec">
              <div className="h"><b>Toutes les voix</b><span>{VOICES.length} voix</span></div>
              <div className="vr">
                {VOICES.map((v, k) => (
                  <button key={v.id} type="button" className="vc" aria-pressed={v.id === voiceId} onClick={() => pickVoice(v.id)}>
                    <Flag country={v.country} size={36} /><div><b>{v.label}</b><span>{v.gender === 'f' ? 'Voix féminine' : 'Voix masculine'}</span></div>
                  </button>
                ))}
              </div>
            </div>
            <span className="hp">?</span>
          </div>
        </section>
      </main>
    </div>
  )
}
