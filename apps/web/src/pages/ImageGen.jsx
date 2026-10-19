import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { gradient } from '../lib/gradients.js'
import Icon from '../lib/icons.jsx'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import useSpeech from '../lib/useSpeech.js'
import GenerationTray from '../components/GenerationTray.jsx'
import Menu from '../components/Menu.jsx'
import BrandToggle from '../components/BrandToggle.jsx'
import ThumbCarousel from '../components/ThumbCarousel.jsx'
import { IMAGE_STYLES, styleById } from '../lib/imageStyles.js'
import { useBrand } from '../lib/brand.jsx'
import { jetons, useJobs } from '../lib/jobs.jsx'
import { IMAGE_MODELS, findModel, imageCost, priceLabel } from '@studio/catalog'
import { modelItem } from '../lib/modelItem.js'
import { logoFor } from '../lib/modelLogos.js'
import ModelLogo from '../components/ModelLogo.jsx'
import '../styles/shell.css'
import '../styles/image.css'

const g = (i) => gradient(i, 'image')
const COLLAGE = [
  { left: 0, top: 8, width: 150, transform: 'rotate(-8deg)' },
  { left: 130, top: 2, transform: 'rotate(3deg)' },
  { left: 260, top: 6, width: 160, height: 160, borderRadius: '50%', borderWidth: 3, opacity: 1 },
  { left: 395, top: 0, transform: 'rotate(5deg)' },
]

export default function ImageGen() {
  useDocumentTitle('Image')
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(1)
  const voice = useSpeech({ onText: setPrompt })
  const { jobs, submit } = useJobs()
  const { brand, style } = useBrand()
  const [error, setError] = useState('')
  const hasJobs = jobs.some((j) => j.kind === 'image')
  const [modelId, setModelId] = useState(IMAGE_MODELS[0].id)
  const [styleId, setStyleId] = useState('none')
  const [ratio, setRatio] = useState('Auto')
  const [res, setRes] = useState('2K')
  const model = findModel(IMAGE_MODELS, modelId)
  const { caps } = model
  // Les valeurs choisies sont ramenées dans ce que le modèle courant accepte.
  const resolution = caps.resolutions.includes(res) ? res : caps.resolutions.includes('2K') ? '2K' : caps.resolutions[0]
  const n = Math.min(count, caps.maxImages)
  const cost = imageCost(model, resolution, n)
  const nextOf = (list, v) => list[(list.indexOf(v) + 1) % list.length]
  const items = IMAGE_MODELS.map((m) => modelItem(m, 'image'))
  const generate = () => {
    const styled = brand.apply && Boolean(style) // style visuel de la marque, ajouté à la description
    const look = styleById(styleId)
    const r = submit({ kind: 'image', title: model.name, prompt: prompt.trim(), brandStyle: styled ? style : undefined, styleHint: look.prompt || undefined, count: n, cost, live: { kind: 'image', modelId: model.id, prompt: prompt.trim(), resolution, ratio, count: n, styleHint: look.prompt || undefined, brandStyle: styled ? style : undefined }, meta: `${n} × ${resolution}${ratio === 'Auto' ? '' : ` · ${ratio}`}${look.prompt ? ` · ${look.label}` : ''}${styled ? ' · style de la marque' : ''}` })
    setError(r.ok ? '' : `Solde insuffisant : il manque ${jetons(r.missing)} jetons.`)
  }

  return (
    <div className="pg shell image">
      <SkipLink />
      <ShellHeader />

      <main className="mn" id="main" tabIndex={-1}>
        <div className="zm"><Icon name="filter" size={16} /><i /></div>

        {hasJobs ? <div className="feed"><GenerationTray kind="image" /></div> : (
        <div className="hero">
          <div className="col">
            {COLLAGE.map((s, i) => <i key={i} style={{ background: g(i), ...s }} />)}
          </div>
          <h1>Commencez à créer avec<span>[MARQUE] Studio cinéma</span></h1>
          <p>Décrivez une scène, un personnage, une ambiance ou un style.</p>
        </div>
        )}

        <div className="dock">
          <div className="insp">
            <ThumbCarousel items={IMAGE_STYLES} value={styleId} onChange={setStyleId} size={30} showLabel label="Style de l’image" />
          </div>
          <div className="pbx">
            <div className="pin">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={voice.listening ? 'Je vous écoute…' : 'Décrivez la scène que vous imaginez'}
                aria-label="Description de la scène"
                data-prompt
              />
              <button
                type="button"
                className={`mic${voice.listening ? ' on' : ''}`}
                disabled={!voice.supported}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Arrêter la dictée' : 'Dicter la description'}
                title={voice.supported ? (voice.listening ? 'Arrêter la dictée' : 'Dicter la description') : 'Dictée non prise en charge par ce navigateur (essayez Chrome, Edge ou Safari)'}
                onClick={() => (voice.listening ? voice.stop() : voice.start(prompt))}
              >
                <Icon name="mic" size={18} />
              </button>
            </div>
            {voice.error && <p className="verr" role="status">{voice.error}</p>}
            {error && <p className="verr" role="alert">{error}</p>}
            <div className="ctl">
              <span className="sp"><Icon name="plus" size={16} /><b className="dv" /><Icon name="at" size={16} /></span>
              <Menu items={items} value={modelId} onChange={setModelId} label="Modèle image" menuWidth={420} search="Rechercher un modèle…" className="cb">
                {logoFor(model.id) ? <ModelLogo logo={logoFor(model.id)} size={16} /> : <Icon name="sparkle" size={16} color="#d6ff3f" />}{model.name}
              </Menu>
              <button type="button" className="cb" aria-label={`Format : ${ratio}`} onClick={() => setRatio(nextOf(caps.ratios, ratio))}><Icon name="expand" size={15} />{ratio}</button>
              <button type="button" className="cb" aria-label={`Résolution : ${resolution}`} disabled={caps.resolutions.length < 2} onClick={() => setRes(nextOf(caps.resolutions, resolution))}><Icon name="diamond" size={15} />{resolution}</button>
              <BrandToggle className="cb" />
              <span className="sp">
                <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Moins">−</button>
                <b style={{ fontWeight: 600 }}>{n}/{caps.maxImages}</b>
                <button type="button" onClick={() => setCount((c) => Math.min(caps.maxImages, c + 1))} aria-label="Plus">+</button>
              </span>
              <button type="button" className="gen2" disabled={!prompt.trim()} onClick={generate}>Générer<small><Icon name="sparkle" size={13} />{jetons(cost)}</small></button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
