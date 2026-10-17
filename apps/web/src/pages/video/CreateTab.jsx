import { useEffect, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import Menu from '../../components/Menu.jsx'
import { Section, DropTile, AddMedia, PlanSection, OptionChips, GenerateBar } from '../../components/GenPanel.jsx'
import useGenSettings from '../../lib/useGenSettings.js'
import { VIDEO_MODELS, findModel, priceLabel } from '@studio/catalog'
import { modelItem } from '../../lib/modelItem.js'
import { logoFor } from '../../lib/modelLogos.js'
import ModelLogo from '../../components/ModelLogo.jsx'
import { useAssets } from '../../lib/assets.jsx'
import { useHandoff } from '../../lib/handoff.jsx'
import { useToast } from '../../lib/toasts.jsx'
import { gradient } from '../../lib/gradients.js'

const g = (i) => gradient(i, 'video')
const PRESETS = ['Travelling avant', 'Orbite 360°', 'Zoom explosif', 'Plan drone', 'Ralenti', 'Plongée', 'Caméra épaule', 'Ambiance néon']

const HINT = 'Décrivez le changement visuel souhaité, par exemple « Il neige » ou « Il fait nuit ».'

/** Modèle à utiliser pour qu'un asset reçu trouve sa place : on garde le modèle courant s'il convient. */
const modelFor = (slot, current) => {
  const c = current.caps
  if (slot === 'start' && c.startFrame !== 'none') return current.id
  if (slot === 'end' && c.endFrame) return current.id
  if (slot === 'audio' && c.audioRef) return current.id
  return { start: 'ltx-2-5-fast', end: 'ltx-2-3-pro', audio: 'ltx-2-3-a2v' }[slot]
}

export function CreateLeft({ panel }) {
  const [modelId, setModelId] = useState(VIDEO_MODELS[0].id)
  const model = findModel(VIDEO_MODELS, modelId)
  const { caps } = model
  const [files, setFiles] = useState({})
  const setFile = (key) => (f) => setFiles((o) => ({ ...o, [key]: f }))

  // Un asset envoyé depuis la bibliothèque : on l'installe dans la bonne entrée et, si besoin, on change de modèle.
  const { pending, take } = useHandoff()
  const lib = useAssets()
  const toast = useToast()
  useEffect(() => {
    if (pending?.target !== 'video.create') return
    const h = take('video.create')
    if (!h) return
    const asset = lib.assets.find((a) => a.id === h.assetId)
    if (!asset) return
    const wanted = h.modelId ?? modelFor(h.slot, model)
    if (wanted !== model.id) {
      setModelId(wanted)
      toast(`Modèle changé pour ${findModel(VIDEO_MODELS, wanted).name} : il accepte cette entrée.`)
    }
    lib.getFile(asset, { frame: h.frame }).then((f) => setFiles((o) => ({ ...o, [h.slot]: f }))).catch(() => toast('Fichier introuvable : réimportez-le dans la bibliothèque.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  // Durée de l'audio fourni (modèles audio → vidéo : elle fixe la durée et le coût de la vidéo).
  const [audioSecs, setAudioSecs] = useState(null)
  useEffect(() => {
    const f = files.audio
    if (!f) return setAudioSecs(null)
    const url = URL.createObjectURL(f)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => setAudioSecs(Math.round(a.duration * 10) / 10)
    a.onerror = () => setAudioSecs(NaN)
    a.src = url
    return () => URL.revokeObjectURL(url)
  }, [files.audio])
  const s = useGenSettings(model, { audioSecs })

  const items = VIDEO_MODELS.map((m) => modelItem(m, 'video'))
  const range = caps.duration.fromAudio
  const blocker = caps.startFrame === 'required' && !files.start ? 'Ce modèle exige une image de départ.'
    : caps.audioRef === 'required' && !files.audio ? `Ce modèle exige un fichier audio${range ? ` de ${range.min} à ${range.max} s` : ''}.`
      : range && files.audio && (Number.isNaN(audioSecs) ? true : audioSecs !== null && (audioSecs < range.min || audioSecs > range.max))
        ? (Number.isNaN(audioSecs) ? 'Ce fichier audio n’a pas pu être lu.' : `Votre audio dure ${String(audioSecs).replace('.', ',')} s : il doit durer entre ${range.min} et ${range.max} s.`)
        : null
  const needsText = !(caps.startFrame === 'optional' && caps.audioRef === 'required' && files.start) // avec une image, le prompt devient facultatif
  const meta = `${model.name} · ${String(s.total).replace('.', ',')} s${s.resolutions ? ` · ${s.res}` : ''}${s.ratios && s.ratio !== 'auto' ? ` · ${s.ratio}` : ''}${caps.fps ? ` · ${s.fps} i/s` : ''}`

  return (
    <div className="ep" {...panel}>
      <div className="mc" style={{ background: g(3) }}>
        <button type="button" className="chg" onClick={() => document.querySelector('[aria-label="Modèle"]')?.click()}><Icon name="pencil" size={13} />Changer</button>
        <h3>Général</h3>
        <span>{model.name}</span>
      </div>

      <Section id="ep-model" title="Modèle">
        <Menu items={items} value={modelId} onChange={setModelId} label="Modèle" menuWidth={420} search="Rechercher un modèle…">
          {logoFor(model.id) ? <ModelLogo logo={logoFor(model.id)} size={18} /> : <Icon name="bars" size={18} />}<span className="ep-ell">{model.name}</span><span className="ep-price">{priceLabel(model)}</span>
        </Menu>
      </Section>

      <Section id="ep-ref" title="Références">
        <div className="ep-tiles">
          <DropTile icon="img" label="Départ" accept="image/*" file={files.start ?? null} onFile={setFile('start')} required={caps.startFrame === 'required'} disabled={caps.startFrame === 'none'} reason="Ce modèle part du texte seul : pas d’image de départ" />
          <DropTile icon="img" label="Fin" accept="image/*" file={files.end ?? null} onFile={setFile('end')} disabled={!caps.endFrame} reason={caps.startFrame === 'none' ? 'Texte seul : pas d’images en entrée' : 'Ce modèle n’accepte pas d’image de fin'} />
          <DropTile icon="mus" label="Piste audio" accept="audio/*" file={files.audio ?? null} onFile={setFile('audio')} required={caps.audioRef === 'required'} disabled={!caps.audioRef} reason="Ce modèle n’accepte pas de piste audio en entrée" />
        </div>
        {caps.elements && (
          <AddMedia
            key={model.id}
            label="Plus"
          />
        )}
      </Section>

      <PlanSection s={s} mentions={{ files }} hint={caps.audioRef === 'required' ? 'Décrivez la scène (obligatoire sans image de départ), ou comment animer votre image au rythme de l’audio.' : caps.startFrame === 'required' ? HINT : caps.startFrame === 'none' ? 'Décrivez la scène : sujet, décor, lumière, mouvement de caméra.' : 'Décrivez la scène, ou ajoutez une image de départ pour l’animer.'} />
      <OptionChips s={s} />
      <GenerateBar s={s} title={model.name} meta={meta} blocker={blocker} needsText={needsText} brand live={{ model, files }} />
    </div>
  )
}

export function CreateRight() {
  return (
    <>
      <div>
        <h1>Créez des vidéos en un clic</h1>
        <p className="sub">Plus de 250 presets pour le mouvement de caméra, le cadrage et les effets, ou le preset général pour un contrôle manuel.</p>
      </div>
      <div className="steps">
        <div className="st">
          <div className="sv">
            <div className="up"><Icon name="img" size={34} />Importer une image</div>
            <div className="tilt" style={{ background: g(6) }} />
          </div>
          <b>Ajoutez une image</b><span>Importez ou générez l'image de départ</span>
        </div>
        <div className="st">
          <div className="sv">
            <div className="strip">
              <i style={{ background: g(8) }} /><i className="c" style={{ background: g(3) }} /><i style={{ background: g(9) }} />
            </div>
          </div>
          <b>Choisissez un preset</b><span>Réglez le mouvement de votre image</span>
        </div>
        <div className="st">
          <div className="sv"><div className="fr" style={{ background: g(4) }} /></div>
          <b>Obtenez la vidéo</b><span>Cliquez sur Générer pour animer</span>
        </div>
      </div>
      <div>
        <div className="sec"><h3>Presets populaires</h3><a href="#">Tout voir</a></div>
        <div className="rail" style={{ marginTop: 10 }}>
          {PRESETS.map((t, i) => (
            <div key={t} className="ps">
              <div className="pm" style={{ background: g(i + 1) }}><Icon name="vid" size={18} color="#fff" /></div>
              <b>{t}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
