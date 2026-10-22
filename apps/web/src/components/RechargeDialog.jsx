import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import Segment from './Segment.jsx'
import { api, apiEnabled } from '../lib/api.js'
import { jetonLabel, jetons, useJobs } from '../lib/jobs.jsx'
import { useToast } from '../lib/toasts.jsx'
import {
  COUNTRIES, OPERATORS, PACKS, STATUS, TOPUP_COUNTRIES, countdown, errorMessage, failureText, fcfa, isFinal, isOpen, limitError, lines,
  maskPhone, telHref, topupCountries, ussdCodes,
} from '../lib/topups.js'
import '../styles/recharge.css'
import Cauri, { Amount } from './Cauri.jsx'

/*
 * Recharge de cauris par Mobile Money (paygate, via l'API), dans une fenêtre, en quatre étapes : pack → opérateur → numéro → paiement.
 * La validation dépend de l'opérateur (`authType` rendu par /topups/options) :
 * - PROVIDER_AUTH (Moov Burkina, Orange Côte d'Ivoire et Sénégal) : on lance, puis l'utilisateur valide sur son téléphone.
 * - PREAUTH (Orange Burkina) : il obtient d'abord un code à usage unique par USSD, le saisit, puis on lance avec ce code.
 * - REDIRECT_AUTH (Wave) : on lance, puis on l'envoie sur Wave ; il revient sur /recharge/retour, qui rouvre cette fenêtre.
 * Pendant le paiement, on interroge /topups/:reference toutes les 3,5 s, même fenêtre fermée. Le prix et les cauris viennent du
 * serveur : le navigateur n'envoie que le pack choisi.
 */
const COUNTRY_LIST = topupCountries(import.meta.env.VITE_TOPUP_COUNTRIES)
const POLL_MS = 3500
const POLL_HIDDEN_MS = 20_000 // onglet caché : on s'en tient à un sondage espacé, et on se remet à jour dès le retour sur l'onglet
const STEPS = ['Pack', 'Opérateur', 'Numéro', 'Paiement']
const FORM = 'rc-form' // les boutons du pied de fenêtre soumettent le formulaire de l'étape
const perJeton = (p) => Math.round(p.fcfa / p.jetons)
const BEST = PACKS.reduce((a, p) => (perJeton(p) < perJeton(a) ? p : a)).id
// Ce que l'utilisateur aura à faire, pour choisir en connaissance de cause. Les consignes exactes viennent de paygate à l'étape 4.
const HOW = { orange: { BF: 'Code obtenu par USSD', other: 'Validation sur le téléphone' }, moov: 'Validation sur le téléphone', wave: 'Validation dans l’app Wave' }
const how = (op, country) => (typeof HOW[op] === 'string' ? HOW[op] : HOW[op][country] ?? HOW[op].other)
const localNumber = (phone, c) => {
  const d = phone.replace(/\D/g, '')
  const local = d.length === c.digits + c.dial.length && d.startsWith(c.dial) ? d.slice(c.dial.length) : d
  return local.replace(/(\d{2})(?=\d)/g, '$1 ')
}

/** Compte à rebours jusqu'à l'échéance du paiement, mis à jour chaque seconde. */
function useCountdown(expiresAt) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!expiresAt) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return countdown(expiresAt, now)
}

function Stepper({ step, onGo }) {
  return (
    <ol className="rc-stepper" aria-label="Étapes de la recharge">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'on' : ''
        const back = i < step && step < 3 // on ne revient pas en arrière une fois le paiement lancé
        const inner = <><i>{i < step ? <Icon name="check" size={12} /> : i + 1}</i><span>{label}</span></>
        return (
          <li key={label} className={state} aria-current={i === step ? 'step' : undefined}>
            {back ? <button type="button" onClick={() => onGo(i)}>{inner}</button> : <div>{inner}</div>}
          </li>
        )
      })}
    </ol>
  )
}

/** Rappel des choix déjà faits, chacun modifiable tant que le paiement n'est pas lancé. */
function Summary({ pack, operator, phone, country, step, onGo }) {
  const c = TOPUP_COUNTRIES[country]
  const items = [
    step > 0 && { k: 0, label: 'Pack', value: <><Amount n={pack.jetons} word /> · {fcfa(pack.fcfa)}</> },
    step > 1 && operator && { k: 1, label: 'Opérateur', value: `${OPERATORS[operator]}${COUNTRY_LIST.length > 1 ? ` · ${COUNTRIES[country]}` : ''}` },
    step > 2 && phone && { k: 2, label: 'Numéro', value: `+${c.dial} ${localNumber(phone, c)}` },
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <dl className="rc-sum">
      {items.map((x) => (
        <div key={x.k}>
          <dt>{x.label}</dt>
          <dd>{x.value}</dd>
          {step < 3 && <button type="button" onClick={() => onGo(x.k)} aria-label={`Modifier : ${x.label}`}>Modifier</button>}
        </div>
      ))}
    </dl>
  )
}

function Steps({ lines: items }) {
  if (!items.length) return null
  const codes = ussdCodes(items)
  return (
    <>
      <ol className="rc-steps">{items.map((l) => <li key={l}>{l}</li>)}</ol>
      {codes.map((code) => (
        // Certains téléphones bloquent les liens USSD : le code reste écrit dans les consignes au-dessus.
        <a key={code} className="rc-dial" href={telHref(code)}><Icon name="send" size={14} />Composer {code}</a>
      ))}
    </>
  )
}

function StatusBadge({ status }) {
  return <span className={`rc-st rc-st-${status}`}>{STATUS[status] ?? status}</span>
}

/** Attente du paiement, puis résultat. */
function Waiting({ topup }) {
  const left = useCountdown(isOpen(topup) ? topup.expiresAt : null)
  if (topup.status === 'completed') {
    return (
      <div className="rc-result ok" role="status">
        <span className="rc-mark"><Icon name="check" size={22} /></span>
        <b>Recharge réussie : +<Amount n={topup.jetons} word /></b>
        <p>{topup.late ? 'Le paiement a été confirmé en retard, mais il est bien crédité. ' : ''}Vos cauris sont disponibles tout de suite.</p>
      </div>
    )
  }
  if (topup.status === 'failed' || topup.status === 'expired') {
    return (
      <div className="rc-result ko" role="alert">
        <span className="rc-mark"><Icon name="alert" size={22} /></span>
        <b>{topup.status === 'expired' ? 'Le délai de paiement est écoulé' : 'Le paiement n’a pas abouti'}</b>
        <p>{topup.status === 'expired' ? 'Rien n’a été débité.' : failureText(topup.failure)} Si votre compte a quand même été débité, la recharge sera créditée dès que l’opérateur le confirmera.</p>
      </div>
    )
  }
  return (
    <div className="rc-wait" role="status" aria-live="polite">
      <div className="rc-spin" aria-hidden="true" />
      <div>
        <b>En attente de votre validation</b>
        <p>{topup.authType === 'REDIRECT_AUTH' ? 'Validez le paiement dans l’application Wave.' : 'Validez le paiement sur votre téléphone. Cette fenêtre se met à jour toute seule, et vous pouvez la fermer : le solde suivra.'}</p>
        <Steps lines={lines(topup.instructions)} />
        {left && <p className="rc-left">Temps restant pour valider : <b>{left}</b></p>}
      </div>
    </div>
  )
}

function History({ items, onOpen }) {
  if (!items) return <p className="rc-note">Chargement…</p>
  if (!items.length) return <p className="rc-note">Aucune recharge pour l’instant.</p>
  return (
    <ul className="rc-hist">
      {items.map((t) => (
        <li key={t.reference}>
          <div>
            <b>+<Amount n={t.jetons} word /></b>
            <span>{fcfa(t.amountFcfa)} · {OPERATORS[t.operator] ?? t.operator} <span className="rc-nw">{maskPhone(t.phone)}</span></span>
            <small>{new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{t.late ? ' · confirmée en retard' : ''}</small>
          </div>
          {isOpen(t) && t.status !== 'awaiting_code'
            ? <button type="button" className="rc-st rc-st-processing" onClick={() => onOpen(t)}>Suivre</button>
            : <StatusBadge status={t.status} />}
        </li>
      ))}
    </ul>
  )
}

export default function RechargeDialog({ open, request, onClose }) {
  const dlg = useRef(null)
  const panel = useRef(null)
  const { balance, syncBalance } = useJobs()
  const toast = useToast()
  const [pack, setPack] = useState('createur')
  const [country, setCountry] = useState(COUNTRY_LIST[0])
  const [operator, setOperator] = useState(null)
  const [phone, setPhone] = useState('')
  const [step, setStep] = useState(0) // 0 pack, 1 opérateur, 2 numéro, 3 paiement (code puis attente)
  const [view, setView] = useState('buy') // 'buy' : le parcours ; 'history' : mes recharges
  const [codeSteps, setCodeSteps] = useState(null) // consignes d'Orange Burkina : présentes tant que le code est attendu
  const [code, setCode] = useState('')
  const [reference, setReference] = useState(null) // recharge déjà enregistrée qu'on relance (code saisi, coupure réseau)
  const [topup, setTopup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)
  const shown = useRef(open) // fenêtre ouverte, lue par le suivi : le message bref ne sert que fenêtre fermée
  shown.current = open
  const seen = useRef(false) // résultat déjà montré (fenêtre ouverte) : la prochaine ouverture repart d'un nouvel achat

  const selected = PACKS.find((p) => p.id === pack) ?? PACKS[0]
  const c = TOPUP_COUNTRIES[country]
  const loadHistory = useCallback(() => { if (apiEnabled) api.topups().then((r) => setHistory(r.topups)).catch(() => {}) }, [])

  const go = (i) => { setError(null); setCodeSteps(null); setCode(''); setStep(i) }
  const restart = (toStep) => { setTopup(null); setReference(null); setCode(''); setCodeSteps(null); setError(null); setStep(toStep) }
  const follow = (t) => { setTopup(t); setPack(t.pack); setOperator(t.operator); setPhone(t.phone ?? ''); setCodeSteps(null); setError(null); setStep(3); setView('buy') }

  // Fenêtre native : ouverte en modale, fermée par Échap, par la croix ou d'un clic sur le fond.
  useEffect(() => {
    const d = dlg.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Chaque ouverture : un pack demandé (accueil, lien) ou une recharge à reprendre (retour de Wave). Un paiement en cours reste affiché.
  const at = request?.at
  useEffect(() => {
    if (!at) return
    loadHistory()
    setView('buy')
    if (request.ref && apiEnabled) {
      api.topup(request.ref).then((r) => { follow(r.topup); syncBalance(r.balance) }).catch((e) => setError(errorMessage(e)))
      return
    }
    const paying = isOpen(topup) || (step === 3 && codeSteps)
    if (paying) return
    if (topup && isFinal(topup) && seen.current) restart(0)
    if (PACKS.some((p) => p.id === request.pack)) { setPack(request.pack); go(0) }
  }, [at]) // une fois par ouverture

  useEffect(() => { if (!isFinal(topup)) seen.current = false; else if (open) seen.current = true }, [open, topup])

  // Suivi : on interroge l'API tant que la recharge n'est pas terminée. Le webhook de paygate fait foi côté serveur.
  const ref = topup?.reference
  const pending = isOpen(topup)
  useEffect(() => {
    if (!ref || !pending) return undefined
    let stop = false
    const tick = async () => {
      try {
        const r = await api.topup(ref)
        if (stop) return
        setTopup(r.topup)
        syncBalance(r.balance)
        if (isFinal(r.topup)) {
          loadHistory()
          if (r.topup.status === 'completed' && !shown.current) toast(`Recharge réussie : +${jetonLabel(r.topup.jetons)}.`)
        }
      } catch { /* erreur passagère : on réessaie au prochain tour */ }
    }
    let timer
    let running = false // un seul appel à la fois : un retour sur l'onglet pendant un appel en cours n'en lance pas un second
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, document.hidden ? POLL_HIDDEN_MS : POLL_MS) }
    const run = async () => {
      if (running || stop) return
      running = true
      try { await tick() } finally { running = false }
      if (!stop) schedule()
    }
    const wake = () => { if (!document.hidden) { clearTimeout(timer); run() } }
    document.addEventListener('visibilitychange', wake)
    schedule()
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake) }
  }, [ref, pending, syncBalance, loadHistory, toast])

  // Chaque étape amène le focus sur son titre : le lecteur d'écran l'annonce, le clavier repart de là.
  useEffect(() => { if (open) panel.current?.focus() }, [open, step, view, Boolean(codeSteps), Boolean(topup)])
  // Une recharge enregistrée ne se relance qu'avec les mêmes détails : changer de pack ou de numéro en démarre une nouvelle.
  useEffect(() => { if (!topup) setReference(null) }, [pack, country, operator, phone])

  /** Lance (ou relance avec `reference`) la recharge, puis passe à la suite selon la réponse. */
  const create = async (preAuthCode) => {
    setBusy(true); setError(null)
    try {
      const r = await api.createTopup({ pack, country, operator, phone, ...(reference ? { reference } : {}), ...(preAuthCode ? { preAuthCode } : {}) })
      syncBalance(r.balance)
      setReference(r.topup.reference)
      if (r.topup.status === 'awaiting_code') { setCodeSteps(lines(r.topup.codeInstructions)); setStep(3); return } // Orange Burkina sans code : paygate n'a rien créé
      setCodeSteps(null); setTopup(r.topup); setStep(3); loadHistory()
      if (r.topup.authType === 'REDIRECT_AUTH' && r.topup.authUrl) window.location.assign(r.topup.authUrl)
    } catch (e) {
      const t = e.body?.topup
      if (t?.reference) setReference(t.reference)
      if ((e.body?.error === 'cannot_retry' && t) || (t && (t.status === 'failed' || t.status === 'expired'))) { setCodeSteps(null); setTopup(t); setStep(3); loadHistory(); return }
      setError(errorMessage(e, { country }))
    } finally { setBusy(false) }
  }

  /** Numéro saisi : on demande à paygate si ce moyen marche pour ce numéro et ce montant, et comment le valider. */
  const checkNumber = async (e) => {
    e.preventDefault()
    if (busy) return
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== c.digits && digits.length !== c.digits + c.dial.length) { setError(errorMessage('invalid_phone', { country })); return }
    setBusy(true); setError(null)
    let options
    try {
      options = await api.topupOptions({ country, operator, phone, pack })
    } catch (err) {
      setBusy(false); setError(errorMessage(err, { country })); return
    }
    setBusy(false)
    const limit = limitError(options, selected.fcfa)
    if (limit) { setError(errorMessage(limit, { country, min: options.min, max: options.max })); return }
    if (options.authType === 'PREAUTH') { setCodeSteps(lines(options.codeInstructions)); setStep(3); return } // le code est lié au montant
    await create()
  }

  const submitCode = (e) => {
    e.preventDefault()
    const v = code.trim()
    if (!/^[A-Za-z0-9]{3,16}$/.test(v)) { setError(errorMessage('invalid_pre_auth_code')); return }
    create(v)
  }

  const err = error && <p className="rc-err" role="alert">{error}</p>
  const title = (text, hidden) => <h3 ref={panel} tabIndex={-1} className={hidden ? 'sr-only' : undefined}>{text}</h3>
  const back = (i) => <button type="button" className="rc-ghost" onClick={() => go(i)}>Retour</button>

  let body
  let foot = null
  if (!apiEnabled) {
    body = <p className="rc-note">Les recharges passent par l’API du studio, qui n’est pas branchée ici (<code>VITE_API_URL</code>).</p>
  } else if (view === 'history') {
    body = <div className="rc-panel">{title('Mes recharges')}<History items={history} onOpen={follow} /></div>
    foot = <button type="button" className="rc-ghost" onClick={() => setView('buy')}>Retour</button>
  } else if (step === 0) {
    body = (
      <form id={FORM} className="rc-panel" onSubmit={(e) => { e.preventDefault(); go(operator ? 2 : 1) }}>
        {title('Combien de cauris ?')}
        <fieldset className="rc-packs">
          <legend className="sr-only">Pack de cauris</legend>
          {PACKS.map((p) => (
            <label key={p.id} className={`rc-pack${pack === p.id ? ' on' : ''}`}>
              <input type="radio" name="pack" value={p.id} checked={pack === p.id} onChange={() => setPack(p.id)} />
              {p.id === BEST && <em>Meilleur prix</em>}
              <span className="rc-qty"><Cauri size={30} /><b>{jetons(p.jetons)}</b> cauris</span>
              <span className="rc-price"><strong>{fcfa(p.fcfa)}</strong><small>≈ {perJeton(p)} FCFA le cauri</small></span>
            </label>
          ))}
        </fieldset>
        <p className="rc-note">Paiement ponctuel par Mobile Money, sans abonnement. Les cauris n’expirent pas.</p>
      </form>
    )
    foot = (
      <>
        {history?.length > 0 && <button type="button" className="rc-link" onClick={() => setView('history')}>Mes recharges</button>}
        <button type="submit" form={FORM} className="rc-pay">Continuer</button>
      </>
    )
  } else if (step === 1) {
    body = (
      <div className="rc-panel">
        {title('Avec quel opérateur ?')}
        {COUNTRY_LIST.length > 1 && (
          <Segment label="Pays" value={country} onChange={(k) => { setCountry(k); setOperator(null) }} options={COUNTRY_LIST.map((k) => ({ id: k, label: COUNTRIES[k] }))} />
        )}
        <div className="rc-ops" role="group" aria-label="Opérateur Mobile Money">
          {c.operators.map((o) => (
            <button key={o} type="button" aria-pressed={operator === o} className={`rc-op rc-op-${o}${operator === o ? ' on' : ''}`} onClick={() => { setOperator(o); go(2) }}>
              <i aria-hidden="true">{OPERATORS[o].charAt(0)}</i>
              <span><b>{OPERATORS[o]}</b><small>{how(o, country)}</small></span>
            </button>
          ))}
        </div>
      </div>
    )
    foot = back(0)
  } else if (step === 2) {
    body = (
      <form id={FORM} className="rc-panel" onSubmit={checkNumber} noValidate>
        {title(`Votre numéro ${OPERATORS[operator]}`)}
        <label className="rc-field">
          <span>Le paiement de {fcfa(selected.fcfa)} sera demandé sur ce numéro.</span>
          <div>
            <em aria-hidden="true">+{c.dial}</em>
            <input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null) }}
              placeholder={country === 'BF' ? '70 12 34 56' : ''} aria-describedby="rc-phone-n" aria-label={`Numéro ${OPERATORS[operator]}, sans l’indicatif +${c.dial}`} />
          </div>
          <small id="rc-phone-n">{c.digits} chiffres, sans l’indicatif.</small>
        </label>
        {err}
      </form>
    )
    foot = <>{back(1)}<button type="submit" form={FORM} className="rc-pay" disabled={busy}>{busy ? 'Un instant…' : `Payer ${fcfa(selected.fcfa)}`}</button></>
  } else if (codeSteps && !topup) {
    body = (
      <form id={FORM} className="rc-panel" onSubmit={submitCode} noValidate>
        {title('Code de paiement Orange Money')}
        <p className="rc-lead">Orange Burkina demande un code à usage unique, valable quelques minutes et lié au montant de {fcfa(selected.fcfa)}.</p>
        <Steps lines={codeSteps.length ? codeSteps : ['Composez le code USSD indiqué par Orange Money pour obtenir un code de paiement.']} />
        <label className="rc-field">
          <span>Code reçu</span>
          <div><input value={code} onChange={(e) => { setCode(e.target.value); setError(null) }} autoComplete="one-time-code" maxLength={16} spellCheck={false} /></div>
        </label>
        {err}
      </form>
    )
    foot = <>{back(2)}<button type="submit" form={FORM} className="rc-pay" disabled={busy}>{busy ? 'Un instant…' : `Valider et payer ${fcfa(selected.fcfa)}`}</button></>
  } else if (topup) {
    body = <div className="rc-panel">{title('Paiement', true)}<Waiting topup={topup} /></div>
    if (topup.status === 'completed') {
      foot = <><button type="button" className="rc-ghost" onClick={() => restart(0)}>Nouvelle recharge</button><Link className="rc-pay" to="/cinema" onClick={onClose}>Créer maintenant</Link></>
    } else if (isFinal(topup)) {
      foot = <><button type="button" className="rc-ghost" onClick={() => restart(0)}>Changer de pack</button><button type="button" className="rc-pay" onClick={() => restart(2)}>Nouvelle tentative</button></>
    } else if (topup.authType === 'REDIRECT_AUTH' && topup.authUrl) {
      foot = <a className="rc-pay" href={topup.authUrl}>Ouvrir Wave</a>
    }
  } else {
    body = <div className="rc-panel">{title('Paiement', true)}{err}</div>
    foot = back(2)
  }

  return (
    <dialog
      ref={dlg}
      className="rc-dlg"
      aria-labelledby="rc-title"
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === dlg.current) onClose() }}
    >
      <header className="rc-top">
        <div>
          <h2 id="rc-title">Recharger</h2>
          <p>Solde : <b><Amount n={balance} word /></b></p>
        </div>
        <button type="button" className="rc-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button>
      </header>
      {apiEnabled && view === 'buy' && <Stepper step={step} onGo={go} />}
      <div className="rc-body">
        {view === 'buy' && step > 0 && (
          <Summary pack={PACKS.find((p) => p.id === pack) ?? selected} operator={operator} phone={phone} country={country} step={step} onGo={go} />
        )}
        {body}
      </div>
      {foot && <footer className="rc-foot">{foot}</footer>}
    </dialog>
  )
}
