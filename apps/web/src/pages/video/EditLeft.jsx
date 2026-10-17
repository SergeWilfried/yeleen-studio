import { useEffect, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import Menu from '../../components/Menu.jsx'
import { Section, QualityMenu, DropTile, AddMedia, PlanSection, OptionChips, GenerateBar } from '../../components/GenPanel.jsx'
import useGenSettings, { next } from '../../lib/useGenSettings.js'
import { EXTEND_MODEL, durationOptions, priceLabel, videoCost } from '@studio/catalog'
import { useAssets } from '../../lib/assets.jsx'
import { useHandoff } from '../../lib/handoff.jsx'
import { useToast } from '../../lib/toasts.jsx'
import { gradient } from '../../lib/gradients.js'
import { EDIT_TOOLS } from './EditTab.jsx'

const MOTION = [
  { id: 'motion', icon: 'vid', title: 'Mouvement + sujet', desc: 'Le mouvement, la caméra et le sujet viennent de votre clip. Mentionnez-le dans l’instruction pour réutiliser son sujet.' },
  { id: 'scene', icon: 'cube', title: 'Scène 3D', desc: 'Construisez le plan vous-même : multi-plans, caméra où vous voulez. Nécessite des références de personnage et de lieu.' },
]
const HINTS = {
  edit: 'Décrivez la modification : « il fait nuit », « ajoute de la pluie »…',
  extend: 'Décrivez la suite : « elle se retourne et s’éloigne »…',
  reframe: 'Précisez le cadrage : « garde le sujet à gauche »…',
  upscale: 'Précisez le rendu : « peau naturelle, textures nettes »…',
  bg: 'Décrivez le sujet à garder : « la danseuse au centre »…',
  hdr: 'Précisez le rendu HDR : « hautes lumières préservées »…',
  fps: 'Précisez le mouvement à fluidifier…',
  depth: 'Précisez la zone à analyser…',
}

/** Puces de l'outil « Étendre la vidéo » : durée ajoutée et contexte repris du clip. Le reste est hérité du clip. */
function ExtendChips({ dur, setDur, picks, context, setContext, contexts }) {
  return (
    <div className="ep-opts three">
      <button type="button" className="ep-chip" title="Durée ajoutée" aria-label={`Durée ajoutée : ${dur} secondes`} onClick={() => setDur(next(picks, dur))}>
        <Icon name="clock" size={16} />+ {dur} s
      </button>
      <button type="button" className="ep-chip" title="Secondes du clip utilisées comme contexte" aria-label={`Contexte : ${context ? `${context} secondes` : 'automatique'}`} onClick={() => setContext(next(contexts, context))}>
        <Icon name="layers" size={16} />{context ? `Contexte ${context} s` : 'Contexte auto'}
      </button>
      <button type="button" className="ep-chip" disabled title="Résolution, format, fréquence et son sont hérités du clip" aria-label="Résolution, format et son hérités du clip">
        <Icon name="screen" size={16} />Hérité
      </button>
    </div>
  )
}

export function EditLeft({ tool, setTool, panel }) {
  const t = EDIT_TOOLS.find((x) => x.id === tool) ?? EDIT_TOOLS[0]
  const s = useGenSettings()
  const [motion, setMotion] = useState(null)
  const [source, setSource] = useState(null)
  const [reference, setReference] = useState(null)
  const extend = t.id === 'extend'

  // Une vidéo envoyée depuis la bibliothèque devient la vidéo source (l'outil est déjà choisi par l'écran).
  const { pending, take } = useHandoff()
  const lib = useAssets()
  const toast = useToast()
  useEffect(() => {
    if (pending?.target !== 'video.edit') return
    const h = take('video.edit')
    if (!h) return
    const asset = lib.assets.find((a) => a.id === h.assetId)
    if (!asset) return
    if (h.direction) setDirection(h.direction) // « Avant » depuis l'écran Cinéma : prolonger au début du clip
    lib.getFile(asset).then(setSource).catch(() => toast('Fichier introuvable : réimportez-le dans la bibliothèque.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
  const xc = EXTEND_MODEL.caps
  const [extDur, setExtDur] = useState(5)
  const [direction, setDirection] = useState('end')
  const [context, setContext] = useState(0)
  const extCost = videoCost(EXTEND_MODEL, extDur)
  const toolItems = EDIT_TOOLS.map((x) => ({ id: x.id, icon: x.icon, title: x.name, desc: x.sub, badge: x.isNew ? 'NEW' : null, aside: x.id === 'extend' ? priceLabel(EXTEND_MODEL) : undefined }))

  return (
    <div className="ep" {...panel}>
      <div className="mc" style={{ background: gradient(1, 'video') }}>
        <h3>Outils d'édition</h3>
        <span>Modifiez, restylez, changez les angles, transformez</span>
      </div>

      <Section id="ep-tool" title="Outil">
        <div className="ep-pair">
          <Menu items={toolItems} value={tool} onChange={setTool} label="Outil d’édition" menuWidth={300}>
            <Icon name={t.icon} size={18} /><span className="ep-ell">{t.name}</span>
          </Menu>
          {!extend && <QualityMenu s={s} />}
        </div>
      </Section>

      <Section id="ep-ref" title="Références">
        <div className="ep-tiles">
          <DropTile icon="vid" label={extend ? 'Vidéo' : 'Vidéo'} accept="video/*" file={source} onFile={setSource} required={extend} />
          <DropTile icon="img" label="Image" accept="image/*" file={reference} onFile={setReference} disabled={extend} reason="Une extension part du clip : pas d’image de référence" />
          {extend ? (
            <DropTile icon="motion" label="Mouvement" accept="video/*" disabled reason="Non utilisé pour une extension" />
          ) : (
            <div className="ep-tile-wrap">
              <Menu items={MOTION} value={motion} onChange={setMotion} label="Mouvement" menuWidth={300} className={`ep-tile ep-mt${motion ? ' has' : ''}`}>
                <Icon name="motion" size={20} /><span>{MOTION.find((m) => m.id === motion)?.title ?? 'Mouvement'}</span>
              </Menu>
              <i className="ep-new">NEW</i>
            </div>
          )}
        </div>
        {!extend && <AddMedia />}
      </Section>

      <PlanSection
        s={s}
        hint={HINTS[t.id]}
        {...(extend ? { modeItems: xc.directions, modeLabel: 'Où prolonger', modeValue: direction, onMode: setDirection, single: true, singleReason: 'Une extension se décrit avec un seul prompt, qui reste facultatif' } : {})}
      />
      {extend ? (
        <ExtendChips dur={extDur} setDur={setExtDur} picks={durationOptions(EXTEND_MODEL.caps)} context={context} setContext={setContext} contexts={xc.context} />
      ) : (
        <OptionChips s={s} />
      )}
      {extend ? (
        <GenerateBar
          s={s}
          title={EXTEND_MODEL.name}
          cost={extCost}
          needsText={false}
          blocker={source ? null : 'Ajoutez la vidéo à étendre.'}
          secs={extDur}
          meta={`+ ${extDur} s ${direction === 'end' ? 'à la fin' : 'au début'}${context ? ` · contexte ${context} s` : ''}`}
        />
      ) : (
        <GenerateBar s={s} title={t.name} />
      )}
    </div>
  )
}
