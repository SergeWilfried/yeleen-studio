import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import Icon from '../lib/icons.jsx'
import { gradient } from '../lib/gradients.js'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import useTabKeys from '../lib/useTabKeys.js'
import GenerationTray from '../components/GenerationTray.jsx'
import { useJobs } from '../lib/jobs.jsx'
import { useHandoff } from '../lib/handoff.jsx'
import { CreateLeft, CreateRight } from './video/CreateTab.jsx'
import { EditRight, EDIT_TOOLS } from './video/EditTab.jsx'
import { EditLeft } from './video/EditLeft.jsx'
import { MotionLeft, MotionRight } from './video/MotionTab.jsx'
import '../styles/shell.css'
import '../styles/video.css'

const TABS = ['Créer une vidéo', 'Modifier', 'Mouvement']
const g = (i) => gradient(i, 'video')

export default function Video() {
  useDocumentTitle('Vidéo')
  const { pending } = useHandoff()
  const toEdit = pending?.target === 'video.edit'
  const [tab, setTab] = useState(toEdit ? TABS[1] : TABS[0])
  const [tool, setTool] = useState(toEdit ? pending.tool : EDIT_TOOLS[0].id)
  // Un asset envoyé alors que l'écran est déjà ouvert : on bascule vers l'onglet et l'outil concernés.
  useEffect(() => {
    if (pending?.target === 'video.edit') { setTab(TABS[1]); setTool(pending.tool) }
    else if (pending?.target === 'video.create') setTab(TABS[0])
  }, [pending])
  const showHelp = tab !== TABS[2]
  const onTabKeys = useTabKeys()
  // Tant qu'une génération vidéo existe, la scène remplace l'état vide (aide, presets, aperçu de l'outil).
  const stage = useJobs().jobs.some((j) => j.kind === 'video') && tab !== TABS[2]
  const panel = { role: 'tabpanel', id: 'video-panel', 'aria-labelledby': `vt-${TABS.indexOf(tab)}` }

  return (
    <div className="pg shell video">
      <SkipLink />
      <ShellHeader />

      <main className="app" id="main" tabIndex={-1}>
        <aside className="lp">
          <div className="tabs" role="tablist" aria-label="Outils vidéo" onKeyDown={onTabKeys}>
            {TABS.map((t, i) => (
              <button key={t} id={`vt-${i}`} type="button" role="tab" aria-selected={tab === t} aria-controls="video-panel" tabIndex={tab === t ? 0 : -1} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          {tab === TABS[0] && <CreateLeft panel={panel} />}
          {tab === TABS[1] && <EditLeft tool={tool} setTool={setTool} panel={panel} />}
          {tab === TABS[2] && <MotionLeft panel={panel} />}
        </aside>

        <section className="mp">
          <div className="pl">
            <a href="#"><Icon name="folder" size={15} />Historique</a>
            <a href="#" style={{ background: '#222326' }}><Icon name="book" size={15} />Comment ça marche</a>
          </div>
          {stage && <GenerationTray kind="video" />}
          {!stage && tab === TABS[0] && <CreateRight />}
          {!stage && tab === TABS[1] && <EditRight key={tool} tool={tool} />}
          {tab === TABS[2] && <MotionRight />}
          {showHelp && !stage && (
            <a href="#" className="help">
              <div className="hs">{[1, 5, 7].map((n) => <i key={n} style={{ background: g(n) }} />)}</div>
              <div><b>Besoin d'aide pour commencer ?</b><span>Visitez l'académie et suivez le parcours</span></div>
              <Icon name="chevR" size={16} />
            </a>
          )}
        </section>
      </main>
    </div>
  )
}
