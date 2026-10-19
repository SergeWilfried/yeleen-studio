import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import useDocumentTitle from '../lib/useDocumentTitle.js'
import Icon from '../lib/icons.jsx'
import { ShellHeader, SkipLink } from '../components/Headers.jsx'
import Segment from '../components/Segment.jsx'
import { api, apiEnabled } from '../lib/api.js'
import { jetonLabel, jetons, useJobs } from '../lib/jobs.jsx'
import { useToast } from '../lib/toasts.jsx'
import {
  COUNTRIES, OPERATORS, PACKS, STATUS, TOPUP_COUNTRIES, countdown, errorMessage, failureText, fcfa, isFinal, isOpen, limitError, lines,
  maskPhone, telHref, topupCountries, ussdCodes,
} from '../lib/topups.js'
import '../styles/shell.css'
import '../styles/recharge.css'

/*
 * Recharge de jetons par Mobile Money (paygate, via l'API), en quatre étapes : pack → opérateur → numéro → paiement.
 * La validation dépend de l'opérateur (`authType` rendu par /topups/options) :
 * - PROVIDER_AUTH (Moov Burkina, Orange Côte d'Ivoire et Sénégal) : on lance, puis l'utilisateur valide sur son téléphone.
 * - PREAUTH (Orange Burkina) : il obtient d'abord un code à usage unique par USSD, le saisit, puis on lance avec ce code.
 * - REDIRECT_AUTH (Wave) : on lance, puis on l'envoie sur Wave ; il revient sur /recharge/retour.
 * Pendant le paiement, on interroge /topups/:reference toutes les 3,5 s. Le prix et les jetons viennent du serveur : le navigateur
 * n'envoie que le pack choisi.
 */
const COUNTRY_LIST = topupCountries(import.meta.env.VITE_TOPUP_COUNTRIES)
const POLL_MS = 3500
const STEPS = ['Pack', 'Opérateur', 'Numéro', 'Paiement']
const perJeton = (p) => Math.round(p.fcfa / p.jetons)
// Ce que l'utilisateur aura à faire, pour choisir en connaissance de cause. Les consignes exactes viennent de paygate à l'étape 4.
const HOW = { orange: { BF: 'Code de paiement à obtenir par USSD', other: 'Validation sur votre téléphone' }, moov: 'Validation sur votre téléphone', wave: 'Validation dans l’application Wave' }
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
        return (
          <li key={label} className={state} aria-current={i === step ? 'step' : undefined}>
            {back
              ? <button type="button" onClick={() => onGo(i)}><i>{i < step ? <Icon name="check" size={12} /> : i + 1}</i>{label}</button>
              : <span><i>{i < step ? <Icon name="check" size={12} /> : i + 1}</i>{label}</span>}
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
    step > 0 && { k: 0, label: 'Pack', value: `${jetons(pack.jetons)} cauris · ${fcfa(pack.fcfa)}` },
    step > 1 && { k: 1, label: 'Opérateur', value: `${OPERATORS[operator]}${COUNTRY_LIST.length > 1 ? ` · ${COUNTRIES[country]}` : ''}` },
    step > 2 && { k: 2, label: 'Numéro', value: `+${c.dial} ${localNumber(phone, c)}` },
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
function Waiting({ topup, onRetry, onDone }) {
  const left = useCountdown(isOpen(topup) ? topup.expiresAt : null)
  if (topup.status === 'completed') {
    return (
      <div className="rc-result ok" role="status">
        <Icon name="check" size={22} />
        <div>
          <b>Recharge réussie : +{jetonLabel(topup.jetons)}</b>
          <p>{topup.late ? 'Le paiement a été confirmé en retard, mais il est bien crédité. ' : ''}Vos cauris sont disponibles tout de suite.</p>
          <div className="rc-actions">
            <Link className="rc-pay" to="/cinema">Créer maintenant</Link>
            <button type="button" className="rc-ghost" onClick={onDone}>Nouvelle recharge</button>
          </div>
        </div>
      </div>
    )
  }
  if (topup.status === 'failed' || topup.status === 'expired') {
    return (
      <div className="rc-result ko" role="alert">
        <Icon name="alert" size={22} />
        <div>
          <b>{topup.status === 'expired' ? 'Le délai de paiement est écoulé' : 'Le paiement n’a pas abouti'}</b>
          <p>{topup.status === 'expired' ? 'Rien n’a été débité.' : failureText(topup.failure)} Si votre compte a quand même été débité, la recharge sera créditée dès que l’opérateur le confirmera.</p>
          <div className="rc-actions">
            <button type="button" className="rc-pay" onClick={onRetry}>Nouvelle tentative</button>
            <button type="button" className="rc-ghost" onClick={onDone}>Changer de pack</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="rc-wait" role="status" aria-live="polite">
      <div className="rc-spin" aria-hidden="true" />
      <div>
        <b>En attente de votre validation</b>
        <p>{topup.authType === 'REDIRECT_AUTH' ? 'Validez le paiement dans l’application Wave.' : 'Validez le paiement sur votre téléphone. Cette page se met à jour toute seule.'}</p>
        <Steps lines={lines(topup.instructions)} />
        {topup.authType === 'REDIRECT_AUTH' && topup.authUrl && <a className="rc-pay" href={topup.authUrl}>Ouvrir Wave</a>}
        {left && <p className="rc-left">Temps restant pour valider : <b>{left}</b></p>}
      </div>
    </div>
  )
}

function History({ items, onOpen }) {
  if (!items?.length) return null
  return (
    <section className="rc-card" aria-labelledby="rc-hist">
      <h2 id="rc-hist">Mes recharges</h2>
      <ul className="rc-hist">
        {items.map((t) => (
          <li key={t.reference}>
            <div>
              <b>+{jetonLabel(t.jetons)}</b>
              <span>{fcfa(t.amountFcfa)} · {OPERATORS[t.operator] ?? t.operator} <span className="rc-nw">{maskPhone(t.phone)}</span></span>
              <small>{new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{t.late ? ' · confirmée en retard' : ''}</small>
            </div>
            {isOpen(t) && t.status !== 'awaiting_code'
              ? <button type="button" className="rc-st rc-st-processing" onClick={() => onOpen(t)}>Suivre</button>
              : <StatusBadge status={t.status} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Recharge() {
  useDocumentTitle('Recharger')
  const { balance, syncBalance } = useJobs()
  const toast = useToast()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const fromLink = PACKS.some((p) => p.id === params.get('pack'))
  const [pack, setPack] = useState(() => (fromLink ? params.get('pack') : 'createur'))
  const [country, setCountry] = useState(COUNTRY_LIST[0])
  const [operator, setOperator] = useState(null)
  const [phone, setPhone] = useState('')
  const [step, setStep] = useState(0) // 0 pack, 1 opérateur, 2 numéro, 3 paiement (code puis attente)
  const [codeSteps, setCodeSteps] = useState(null) // consignes d'Orange Burkina : présentes tant que le code est attendu
  const [code, setCode] = useState('')
  const [reference, setReference] = useState(null) // recharge déjà enregistrée qu'on relance (code saisi, coupure réseau)
  const [topup, setTopup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)
  const panel = useRef(null)

  const selected = PACKS.find((p) => p.id === pack)
  const c = TOPUP_COUNTRIES[country]
  const loadHistory = useCallback(() => { if (apiEnabled) api.topups().then((r) => setHistory(r.topups)).catch(() => {}) }, [])
  useEffect(loadHistory, [loadHistory])

  // Retour de Wave (/recharge/retour?ref=…) : on reprend le suivi de cette recharge.
  useEffect(() => {
    const ref = params.get('ref')
    if (!apiEnabled || !pathname.startsWith('/recharge/retour') || !ref) return
    api.topup(ref).then((r) => { setTopup(r.topup); setPack(r.topup.pack); setOperator(r.topup.operator); setStep(3); syncBalance(r.balance) }).catch((e) => setError(errorMessage(e)))
  }, [pathname, params, syncBalance])

  // Suivi : on interroge l'API tant que la recharge n'est pas terminée. Le webhook de paygate fait foi côté serveur.
  const ref = topup?.reference
  const open = isOpen(topup)
  useEffect(() => {
    if (!ref || !open) return undefined
    let stop = false
    const tick = async () => {
      try {
        const r = await api.topup(ref)
        if (stop) return
        setTopup(r.topup)
        syncBalance(r.balance)
        if (isFinal(r.topup)) {
          loadHistory()
          if (r.topup.status === 'completed') toast(`Recharge réussie : +${jetonLabel(r.topup.jetons)}.`)
        }
      } catch { /* erreur passagère : on réessaie au prochain tour */ }
    }
    const id = setInterval(tick, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [ref, open, syncBalance, loadHistory, toast])

  // Chaque étape amène le focus sur son titre : le lecteur d'écran l'annonce, le clavier repart de là.
  useEffect(() => { panel.current?.focus() }, [step, Boolean(codeSteps)])
  // Une recharge enregistrée ne se relance qu'avec les mêmes détails : changer de pack ou de numéro en démarre une nouvelle.
  useEffect(() => setReference(null), [pack, country, operator, phone])

  const go = (i) => { setError(null); setCodeSteps(null); setCode(''); setStep(i) }
  const restart = (toStep) => { setTopup(null); setReference(null); setCode(''); setCodeSteps(null); setError(null); setStep(toStep) }

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

  if (!apiEnabled) {
    return (
      <div className="pg shell rc">
        <SkipLink />
        <ShellHeader />
        <main className="rc-main" id="main" tabIndex={-1}>
          <h1>Recharger</h1>
          <p className="rc-note">Les recharges passent par l’API du studio, qui n’est pas branchée ici (<code>VITE_API_URL</code>).</p>
        </main>
      </div>
    )
  }

  const err = error && <p className="rc-err" role="alert">{error}</p>
  return (
    <div className="pg shell rc">
      <SkipLink />
      <ShellHeader />
      <main className="rc-main" id="main" tabIndex={-1}>
        <header className="rc-head">
          <h1>Recharger</h1>
          <p>Solde actuel : <b>{jetonLabel(balance)}</b>. Payez par Mobile Money : les cauris arrivent dès que l’opérateur confirme.</p>
        </header>

        <section className="rc-card rc-flow">
          <Stepper step={step} onGo={go} />
          <Summary pack={topup ? PACKS.find((p) => p.id === topup.pack) ?? selected : selected} operator={topup?.operator ?? operator} phone={topup?.phone ?? phone} country={country} step={step} onGo={go} />

          {step === 0 && (
            <form className="rc-panel" onSubmit={(e) => { e.preventDefault(); go(operator ? 2 : 1) }}>
              <h2 ref={panel} tabIndex={-1}>Combien de cauris ?</h2>
              <fieldset className="rc-packs">
                <legend className="sr-only">Pack de cauris</legend>
                {PACKS.map((p) => (
                  <label key={p.id} className={`rc-pack${pack === p.id ? ' on' : ''}`}>
                    <input type="radio" name="pack" value={p.id} checked={pack === p.id} onChange={() => setPack(p.id)} />
                    <b>{jetons(p.jetons)}<span> cauris</span></b>
                    <strong>{fcfa(p.fcfa)}</strong>
                    <small>≈ {perJeton(p)} FCFA le cauri</small>
                  </label>
                ))}
              </fieldset>
              <div className="rc-actions"><button type="submit" className="rc-pay">Continuer</button></div>
              <p className="rc-note">Paiement ponctuel, sans abonnement. Le prix est fixé par le studio : vous ne payez que le montant affiché.</p>
            </form>
          )}

          {step === 1 && (
            <div className="rc-panel">
              <h2 ref={panel} tabIndex={-1}>Avec quel opérateur ?</h2>
              {COUNTRY_LIST.length > 1 && (
                <Segment label="Pays" value={country} onChange={(k) => { setCountry(k); setOperator(null) }} options={COUNTRY_LIST.map((k) => ({ id: k, label: COUNTRIES[k] }))} />
              )}
              <div className="rc-ops" role="radiogroup" aria-label="Opérateur Mobile Money">
                {c.operators.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={operator === o} className={`rc-op rc-op-${o}${operator === o ? ' on' : ''}`} onClick={() => { setOperator(o); go(2) }}>
                    <i aria-hidden="true">{OPERATORS[o].charAt(0)}</i>
                    <span><b>{OPERATORS[o]}</b><small>{how(o, country)}</small></span>
                    <Icon name="chevR" size={18} />
                  </button>
                ))}
              </div>
              <div className="rc-actions"><button type="button" className="rc-ghost" onClick={() => go(0)}>Retour</button></div>
            </div>
          )}

          {step === 2 && (
            <form className="rc-panel" onSubmit={checkNumber} noValidate>
              <h2 ref={panel} tabIndex={-1}>Votre numéro {OPERATORS[operator]}</h2>
              <label className="rc-phone">
                <span>Le paiement de {fcfa(selected.fcfa)} sera demandé sur ce numéro.</span>
                <div>
                  <em aria-hidden="true">+{c.dial}</em>
                  <input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null) }}
                    placeholder={country === 'BF' ? '70 12 34 56' : ''} aria-describedby="rc-phone-n" aria-label={`Numéro ${OPERATORS[operator]}, sans l’indicatif +${c.dial}`} />
                </div>
                <small id="rc-phone-n">{c.digits} chiffres, sans l’indicatif.</small>
              </label>
              {err}
              <div className="rc-actions">
                <button type="submit" className="rc-pay" disabled={busy}>{busy ? 'Un instant…' : `Payer ${fcfa(selected.fcfa)}`}</button>
                <button type="button" className="rc-ghost" onClick={() => go(1)}>Retour</button>
              </div>
            </form>
          )}

          {step === 3 && codeSteps && !topup && (
            <form className="rc-panel" onSubmit={submitCode} noValidate>
              <h2 ref={panel} tabIndex={-1}>Code de paiement Orange Money</h2>
              <p className="rc-lead">Orange Burkina demande un code à usage unique, valable quelques minutes et lié au montant de {fcfa(selected.fcfa)}.</p>
              <Steps lines={codeSteps.length ? codeSteps : ['Composez le code USSD indiqué par Orange Money pour obtenir un code de paiement.']} />
              <label className="rc-phone">
                <span>Code reçu</span>
                <div><input value={code} onChange={(e) => { setCode(e.target.value); setError(null) }} autoComplete="one-time-code" maxLength={16} spellCheck={false} /></div>
              </label>
              {err}
              <div className="rc-actions">
                <button type="submit" className="rc-pay" disabled={busy}>{busy ? 'Un instant…' : `Valider et payer ${fcfa(selected.fcfa)}`}</button>
                <button type="button" className="rc-ghost" onClick={() => go(2)}>Retour</button>
              </div>
            </form>
          )}

          {step === 3 && topup && (
            <div className="rc-panel">
              <h2 ref={panel} tabIndex={-1} className="sr-only">Paiement</h2>
              <Waiting topup={topup} onRetry={() => restart(2)} onDone={() => restart(0)} />
            </div>
          )}
          {step === 3 && !topup && !codeSteps && err}
        </section>

        {/* L'historique n'apparaît qu'avant l'achat : pendant le parcours, rien ne détourne du paiement en cours. */}
        {step === 0 && <History items={history} onOpen={(t) => { setTopup(t); setPack(t.pack); setOperator(t.operator); setCodeSteps(null); setStep(3) }} />}
      </main>
    </div>
  )
}
