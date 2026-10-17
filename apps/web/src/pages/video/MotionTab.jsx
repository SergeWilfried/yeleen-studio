import { useState } from 'react'
import Icon, { PlayBadge } from '../../lib/icons.jsx'
import { gradient } from '../../lib/gradients.js'

const g = (i) => gradient(i, 'video')
const SOURCES = ['Vidéo', 'Image']

export function MotionLeft({ panel }) {
  const [scene, setScene] = useState(true)
  const [source, setSource] = useState('Image')
  return (
    <div className="lp-panel" {...panel}>
      <div className="mc" style={{ background: g(7) }}>
        <a href="#" className="chg"><Icon name="book" size={13} />Comment ça marche</a>
        <h3>Mouvement</h3>
        <span>Pilotez le mouvement avec des vidéos de référence</span>
      </div>
      <div className="dz2">
        <div className="dz">
          <i className="ci"><Icon name="vid" size={15} /></i>
          <span style={{ color: '#e6e6e2', fontSize: 13 }}>Ajouter un mouvement à copier</span>
          <span style={{ fontSize: 12, textAlign: 'center' }}>Durée de la vidéo : 3 à 30 secondes</span>
        </div>
        <div className="dz">
          <i className="ci"><Icon name="plus" size={15} /></i>
          <span style={{ color: '#e6e6e2', fontSize: 13 }}>Ajoutez votre personnage</span>
          <span style={{ fontSize: 12, textAlign: 'center' }}>Image avec visage et corps visibles</span>
        </div>
      </div>
      <div className="row">
        <div><small>Modèle</small><b>Contrôle du mouvement 3.0 <Icon name="motion" size={16} color="#d6ff3f" /></b></div>
        <span className="r"><Icon name="chevR" size={16} /></span>
      </div>
      <div className="row">
        <div><small>Qualité</small><b>720p</b></div>
        <span className="r"><Icon name="chevR" size={16} /></span>
      </div>
      <div className="scn">
        <div className="scr">
          <b>Mode contrôle de scène</b>
          <button type="button" role="switch" aria-checked={scene} aria-label="Mode contrôle de scène" className={`sw${scene ? ' on' : ''}`} onClick={() => setScene((v) => !v)} />
        </div>
        {scene && (
          <>
            <div className="seg" role="radiogroup" aria-label="Source de l’arrière-plan" style={{ background: '#101113' }}>
              {SOURCES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={source === s} className={source === s ? 'on' : ''} onClick={() => setSource(s)}>
                  <Icon name={s === 'Vidéo' ? 'vid' : 'img'} size={14} /> {s}
                </button>
              ))}
            </div>
            <p>Choisissez d'où vient l'arrière-plan : l'image du personnage ou la vidéo de mouvement</p>
          </>
        )}
      </div>
      <div className="adv"><b style={{ fontWeight: 600 }}>Réglages avancés</b><span><Icon name="chevD" size={14} /></span></div>
      <button type="button" className="gen">Générer <Icon name="sparkle" size={16} /> 7</button>
    </div>
  )
}

export function MotionRight() {
  return (
    <div className="mscroll">
      <section className="mb">
        <div>
          <h1>Recréez n'importe quel <span className="br">mouvement</span><br />avec votre image</h1>
          <p>Copiez le mouvement d'une vidéo et placez votre personnage dans le même mouvement</p>
        </div>
        <div className="mt">
          <i style={{ background: g(2), left: 0, top: 18, transform: 'rotate(-6deg)' }} />
          <i style={{ background: g(4), left: 112, top: 0, zIndex: 2 }} />
          <i style={{ background: g(3), left: 224, top: 20, transform: 'rotate(7deg)' }} />
        </div>
      </section>
      <section className="lb">
        <h3>Commencez par copier un mouvement de la bibliothèque</h3>
        <div className="lg5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="lt" style={{ background: g(i + 1) }}><PlayBadge /></div>
          ))}
        </div>
      </section>
    </div>
  )
}
