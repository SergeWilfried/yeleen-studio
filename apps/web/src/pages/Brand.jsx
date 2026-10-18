import useDocumentTitle from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { gradient } from '../lib/gradients.js'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import { useLibrary } from '../lib/libraryDialog.jsx'
import Menu from '../components/Menu.jsx'
import PromoBar from '../components/PromoBar.jsx'
import Segment from '../components/Segment.jsx'
import EndCard from '../components/EndCard.jsx'
import { Section, DropTile } from '../components/GenPanel.jsx'
import { useAssets } from '../lib/assets.jsx'
import { BASES, LOOKS, SWATCHES, brandSet, brandVars, contrast, isHex, useBrand, useLogoUrl } from '../lib/brand.jsx'
import { LANGS, TONES, VOICES, digits } from '@studio/spot'
import useTabKeys from '../lib/useTabKeys.js'
import '../styles/shell.css'
import '../styles/video.css'
import '../styles/library.css'
import '../styles/edit-panel.css'
import '../styles/spot.css'
import '../styles/brand.css'

const TABS = [
  { id: 'id', label: 'Identité', hint: 'Votre nom, votre numéro et votre logo, saisis une seule fois.' },
  { id: 'col', label: 'Couleurs', hint: 'Elles colorent la carte finale de vos spots.' },
  { id: 'style', label: 'Style', hint: 'Ton, voix et allure de vos images et vidéos.' },
]
const TONE_NOTE = { warm: 'Proche et rassurant : idéal pour un commerce de quartier.', bold: 'Énergique et direct : pour une promo ou un lancement.', premium: 'Sobre et élégant : pour une marque haut de gamme.' }

/** Choix d'une couleur : sélecteur natif, saisie hexadécimale et pastilles. */
function ColorField({ label, value, onChange, swatches }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = (v) => { setText(v); if (isHex(v)) onChange(v.toLowerCase()) }
  return (
    <div className="br-color">
      <div className="br-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} : sélecteur`} />
        <input className="br-hex" value={text} onChange={(e) => commit(e.target.value)} onBlur={() => setText(value)} maxLength={7} spellCheck={false} aria-label={`${label} : code hexadécimal`} aria-invalid={isHex(text) ? undefined : true} />
      </div>
      <div className="br-sw" role="group" aria-label={`${label} : pastilles`}>
        {swatches.map((c) => (
          <button key={c} type="button" style={{ background: c }} aria-label={c} aria-pressed={value === c} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  )
}

export default function Brand() {
  useDocumentTitle('Marque')
  const { openLibrary } = useLibrary()
  const { brand, patch, reset, colors, style } = useBrand()
  const { assets, getFile } = useAssets()
  const [tab, setTab] = useState(0)
  const [touched, setTouched] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const onTabKeys = useTabKeys()
  const logoUrl = useLogoUrl(brand.logoId)
  const logoAsset = brand.logoId ? assets.find((a) => a.id === brand.logoId) : null

  // Le logo enregistré est un asset de la bibliothèque : on en reconstruit le fichier pour la vignette.
  useEffect(() => {
    if (!logoAsset) return setLogoFile(null)
    let dead = false
    getFile(logoAsset).then((f) => { if (!dead) setLogoFile(f) }).catch(() => setLogoFile(null))
    return () => { dead = true }
  }, [logoAsset?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => patch({ [k]: e.target.value })
  const waBad = brand.whatsapp.trim() && (digits(brand.whatsapp).length < 8 || digits(brand.whatsapp).length > 15)
  const baseCr = contrast(colors.base, colors.ink)
  const priCr = contrast(colors.primary, colors.base)
  const toggleLook = (id) => patch({ looks: brand.looks.includes(id) ? brand.looks.filter((x) => x !== id) : [...brand.looks, id] })
  const langItems = LANGS.map((l) => ({ id: l.id, title: l.label }))
  const voiceItems = VOICES.map((v) => ({ id: v.id, title: `Voix · ${v.label}` }))
  const ready = brandSet(brand)
  const uses = [
    { id: 'spot', to: '/spot', title: 'Spot pub', on: ready, what: 'Brief prérempli, carte finale à vos couleurs avec votre logo.' },
    { id: 'image', to: '/image', title: 'Image', on: Boolean(style) && brand.apply, what: 'Votre style visuel est ajouté à la description.' },
    { id: 'video', to: '/video', title: 'Vidéo · Créer', on: Boolean(style) && brand.apply, what: 'Votre style visuel est ajouté à la description.' },
  ]

  return (
    <div className="pg shell video spot brand">
      <SkipLink />
      <PromoBar seconds={2 * 3600 + 53 * 60 + 15} cta="Obtenir 50 % de remise">
        Génération illimitée sur les formules Max. Remise personnelle de 50 %
      </PromoBar>
      <ShellHeader />

      <main className="app" id="main" tabIndex={-1}>
        <aside className="lp">
          <div className="tabs" role="tablist" aria-label="Kit de marque" onKeyDown={onTabKeys}>
            {TABS.map((t, i) => (
              <button key={t.id} id={`brt-${i}`} type="button" role="tab" aria-selected={tab === i} aria-controls="brand-panel" tabIndex={tab === i ? 0 : -1} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t.label}</button>
            ))}
          </div>

          <div className="ep" role="tabpanel" id="brand-panel" aria-labelledby={`brt-${tab}`}>
            <div className="mc" style={{ background: gradient(5, 'video') }}>
              <h1>Ma marque</h1>
              <span>{TABS[tab].hint}</span>
            </div>

            <div className="ep-fs">
              {tab === 0 && (
                <>
                  <Section id="br-id" title="Votre entreprise">
                    <label className="ep-field">
                      <span>Nom de l’entreprise</span>
                      <input value={brand.name} onChange={set('name')} placeholder="Ex. Chez Maman Awa" autoComplete="organization" />
                    </label>
                    <label className="ep-field">
                      <span>WhatsApp</span>
                      <input type="tel" inputMode="tel" value={brand.whatsapp} onChange={set('whatsapp')} onBlur={() => setTouched(true)} placeholder="+226 70 12 34 56" autoComplete="tel" aria-invalid={touched && waBad ? true : undefined} aria-describedby={touched && waBad ? 'e-brwa' : undefined} />
                      {touched && waBad && <em id="e-brwa" role="alert">Indiquez un numéro avec l’indicatif du pays (8 à 15 chiffres).</em>}
                    </label>
                  </Section>
                  <Section id="br-logo" title="Logo">
                    <div className="ep-tiles one">
                      <DropTile icon="img" label={logoAsset ? logoAsset.name : 'Votre logo'} accept="image/*" file={logoFile} onFile={(f, a) => { setLogoFile(f); patch({ logoId: a?.id ?? null }) }} />
                    </div>
                    <p className="ep-note">PNG à fond transparent de préférence. Il apparaît sur la carte finale de vos spots.</p>
                  </Section>
                </>
              )}

              {tab === 1 && (
                <>
                  <Section id="br-c1" title="Couleur principale">
                    <ColorField label="Couleur principale" value={colors.primary} onChange={(primary) => patch({ primary })} swatches={SWATCHES} />
                    <p className="ep-note">Prix et bouton WhatsApp de la carte finale.</p>
                  </Section>
                  <Section id="br-c0" title="Fond de la carte">
                    <ColorField label="Fond" value={colors.base} onChange={(base) => patch({ base })} swatches={BASES} />
                    <p className={`ep-note br-cr${baseCr >= 4.5 && priCr >= 3 ? '' : ' bad'}`} role="status">
                      {baseCr >= 4.5 && priCr >= 3
                        ? `Lisible : texte ${baseCr.toFixed(1).replace('.', ',')}:1, couleur principale ${priCr.toFixed(1).replace('.', ',')}:1 sur le fond.`
                        : `Peu lisible : ${baseCr < 4.5 ? 'le texte' : 'la couleur principale'} manque de contraste avec ce fond (${(baseCr < 4.5 ? baseCr : priCr).toFixed(1).replace('.', ',')}:1). Choisissez des teintes plus éloignées.`}
                    </p>
                  </Section>
                </>
              )}

              {tab === 2 && (
                <>
                  <Section id="br-tone" title="Ton">
                    <Segment label="Ton" value={brand.tone} onChange={(tone) => patch({ tone })} options={TONES} />
                    <p className="ep-note">{TONE_NOTE[brand.tone]}</p>
                  </Section>
                  <Section id="br-voice" title="Langue et voix">
                    <div className="ep-pair even">
                      <Menu items={langItems} value={brand.lang} onChange={(lang) => patch({ lang })} label="Langue" menuWidth={200}>
                        <span className="ep-ell">{LANGS.find((l) => l.id === brand.lang).label}</span>
                      </Menu>
                      <Menu items={voiceItems} value={brand.voice} onChange={(voice) => patch({ voice })} label="Voix" menuWidth={220}>
                        <Icon name="sound" size={16} /><span className="ep-ell">{VOICES.find((v) => v.id === brand.voice).label}</span>
                      </Menu>
                    </div>
                  </Section>
                  <Section id="br-look" title="Allure des images">
                    <div className="br-looks" role="group" aria-label="Allure des images">
                      {LOOKS.map((l) => (
                        <button key={l.id} type="button" className="ep-chip" aria-pressed={brand.looks.includes(l.id)} onClick={() => toggleLook(l.id)}>{l.label}</button>
                      ))}
                    </div>
                    <label className="ep-field">
                      <span>Précisions <small>facultatif</small></span>
                      <textarea rows={2} value={brand.notes} onChange={set('notes')} placeholder="Ex. pagnes wax, marché de Ouagadougou, lumière du matin" />
                    </label>
                    <label className="br-check">
                      <input type="checkbox" checked={brand.apply} onChange={(e) => patch({ apply: e.target.checked })} />
                      <span>Ajouter ce style aux prompts Image, Vidéo et Spot pub</span>
                    </label>
                  </Section>
                </>
              )}
            </div>

            <div className="ep-gen">
              <p className="br-saved" role="status"><Icon name="check" size={13} />Enregistrée automatiquement sur cet appareil</p>
              <Link className="gen" to="/spot">Créer un spot avec ma marque<span><Icon name="sparkle" size={16} /></span></Link>
            </div>
          </div>
        </aside>

        <section className="mp" aria-label="Aperçu de la marque">
          <div className="pl">
            <button type="button" aria-haspopup="dialog" onClick={() => openLibrary()}><Icon name="folder" size={15} />Bibliothèque</button>
            <button type="button" onClick={() => { reset(); setLogoFile(null); setTouched(false) }}>Réinitialiser</button>
          </div>

          <div className="sp-stage">
            <div className="spp">
              <div className="spp-screen" style={brandVars(colors)}>
                <EndCard className="br-card" title={brand.name.trim() || 'Votre entreprise'} offer="Votre offre en une phrase" price="500 FCFA" whatsapp={brand.whatsapp.trim() ? brand.whatsapp : ''} logoUrl={logoUrl} />
              </div>
              <p className="ep-note">Aperçu de la carte finale</p>
            </div>

            <ul className="br-uses" aria-label="Où votre marque s’applique">
              {uses.map((u) => (
                <li key={u.id}>
                  <span className={`br-dot${u.on ? ' on' : ''}`} aria-hidden="true">{u.on && <Icon name="check" size={12} />}</span>
                  <div>
                    <b>{u.title}<span className="sr-only">{u.on ? ' : actif' : ' : à compléter'}</span></b>
                    <p>{u.on ? u.what : u.id === 'spot' ? 'Renseignez le nom et le WhatsApp.' : 'Choisissez une allure ou ajoutez des précisions.'}</p>
                  </div>
                  <Link to={u.to}>Ouvrir<Icon name="chevR" size={13} /></Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
