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
 * Recharge de jetons par Mobile Money (paygate, via l'API). Étapes : pack → numéro et opérateur → validation propre à l'opérateur
 * (`authType` rendu par /topups/options) → attente du paiement, en interrogeant /topups/:reference toutes les 3,5 s.
 * - PROVIDER_AUTH (Moov Burkina, Orange Côte d'Ivoire et Sénégal) : on lance, puis l'utilisateur valide sur son téléphone.
 * - PREAUTH (Orange Burkina) : il obtient d'abord un code à usage unique par USSD, le saisit, puis on lance avec ce code.
 * - REDIRECT_AUTH (Wave) : on lance, puis on l'envoie sur Wave ; il revient sur /recharge/retour.
 * Le prix et les jetons viennent du serveur ; le navigateur n'envoie que le pack choisi.
 */
const COUNTRY_LIST = topupCountries(import.meta.env.VITE_TOPUP_COUNTRIES)
const POLL_MS = 3500
const perJeton = (p) => Math.round(p.fcfa / p.jetons)

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

function Steps({ lines: items }) {
  if (!items.length) return null
  const codes = ussdCodes(items)
  return (
    <>
      <ol className="rc-steps">{items.map((l) => <li key={l}>{l}</li>)}</ol>
      {codes.map((c) => (
        // Certains téléphones bloquent les liens USSD : le code reste écrit dans les consignes au-dessus.
        <a key={c} className="rc-dial" href={telHref(c)}><Icon name="send" size={14} />Composer {c}</a>
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
          <p>{topup.late ? 'Le paiement a été confirmé en retard, mais il est bien crédité. ' : ''}Vos jetons sont disponibles tout de suite.</p>
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
  const steps = lines(topup.instructions)
  return (
    <div className="rc-wait" role="status" aria-live="polite">
      <div className="rc-spin" aria-hidden="true" />
      <div>
        <b>{OPERATORS[topup.operator]} · {fcfa(topup.amountFcfa)}</b>
        <p>{topup.authType === 'REDIRECT_AUTH' ? 'Validez le paiement dans l’application Wave.' : 'Validez le paiement sur votre téléphone. Cette page se met à jour toute seule.'}</p>
        <Steps lines={steps} />
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
              <span>{fcfa(t.amountFcfa)} · {OPERATORS[t.operator] ?? t.operator} {maskPhone(t.phone)}</span>
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
  const [pack, setPack] = useState(() => (PACKS.some((p) => p.id === params.get('pack')) ? params.get('pack') : 'createur'))
  const [country, setCountry] = useState(COUNTRY_LIST[0])
  const [operator, setOperator] = useState(TOPUP_COUNTRIES[COUNTRY_LIST[0]].operators[0])
  const [phone, setPhone] = useState('')
  const [step, setStep] = useState('choose') // choose → code (Orange Burkina) → wait
  const [codeSteps, setCodeSteps] = useState([])
  const [code, setCode] = useState('')
  const [reference, setReference] = useState(null) // recharge déjà enregistrée qu'on relance (code saisi, coupure réseau)
  const [topup, setTopup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)
  const codeInput = useRef(null)

  const selected = PACKS.find((p) => p.id === pack)
  const c = TOPUP_COUNTRIES[country]
  const loadHistory = useCallback(() => { if (apiEnabled) api.topups().then((r) => setHistory(r.topups)).catch(() => {}) }, [])
  useEffect(loadHistory, [loadHistory])

  // Retour de Wave (/recharge/retour?ref=…) : on reprend le suivi de cette recharge.
  useEffect(() => {
    const ref = params.get('ref')
    if (!apiEnabled || !pathname.startsWith('/recharge/retour') || !ref) return
    api.topup(ref).then((r) => { setTopup(r.topup); setStep('wait'); syncBalance(r.balance) }).catch((e) => setError(errorMessage(e)))
  }, [pathname, params, syncBalance])

  // Suivi : on interroge l'API tant que la recharge n'est pas terminée. Le webhook de paygate fait foi côté serveur.
  const ref = topup?.reference
  const open = isOpen(topup)
  useEffect(() => {
    if (step !== 'wait' || !ref || !open) return undefined
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
  }, [step, ref, open, syncBalance, loadHistory, toast])

  useEffect(() => { if (step === 'code') codeInput.current?.focus() }, [step])
  // Une recharge enregistrée ne se relance qu'avec les mêmes détails : changer de pack ou de numéro en démarre une nouvelle.
  useEffect(() => setReference(null), [pack, country, operator, phone])

  const reset = (keepPack = true) => {
    setStep('choose'); setTopup(null); setReference(null); setCode(''); setCodeSteps([]); setError(null)
    if (!keepPack) setPack('createur')
  }

  const chooseCountry = (k) => { setCountry(k); setOperator(TOPUP_COUNTRIES[k].operators[0]); setError(null) }

  /** Lance (ou relance avec `reference`) la recharge, puis passe à l'étape suivante selon la réponse. */
  const create = async (preAuthCode) => {
    setBusy(true); setError(null)
    try {
      const r = await api.createTopup({ pack, country, operator, phone, ...(reference ? { reference } : {}), ...(preAuthCode ? { preAuthCode } : {}) })
      syncBalance(r.balance)
      setReference(r.topup.reference)
      if (r.topup.status === 'awaiting_code') { // Orange Burkina sans code : paygate n'a rien créé, on demande le code
        setCodeSteps(lines(r.topup.codeInstructions)); setStep('code'); return
      }
      setTopup(r.topup); setStep('wait'); loadHistory()
      if (r.topup.authType === 'REDIRECT_AUTH' && r.topup.authUrl) window.location.assign(r.topup.authUrl)
    } catch (e) {
      const t = e.body?.topup
      if (t?.reference) setReference(t.reference)
      if (e.body?.error === 'cannot_retry' && t) { setTopup(t); setStep('wait'); return }
      if (t && (t.status === 'failed' || t.status === 'expired')) { setTopup(t); setStep('wait'); loadHistory(); return }
      setError(errorMessage(e, { country }))
    } finally { setBusy(false) }
  }

  const start = async (e) => {
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
    if (options.authType === 'PREAUTH') { setCodeSteps(lines(options.codeInstructions)); setStep('code'); return } // le code est lié au montant : pack verrouillé
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

  return (
    <div className="pg shell rc">
      <SkipLink />
      <ShellHeader />
      <main className="rc-main" id="main" tabIndex={-1}>
        <header className="rc-head">
          <h1>Recharger</h1>
          <p>Solde actuel : <b>{jetonLabel(balance)}</b>. Payez par Mobile Money : les jetons arrivent dès que l’opérateur confirme.</p>
        </header>

        {step === 'wait' && topup ? (
          <section className="rc-card" aria-label="Suivi du paiement">
            <Waiting topup={topup} onRetry={() => { setTopup(null); setReference(null); setCode(''); setStep('choose') }} onDone={() => reset()} />
          </section>
        ) : (
          <form className="rc-card" onSubmit={step === 'code' ? submitCode : start} noValidate>
            <fieldset className="rc-packs" disabled={step === 'code' || busy}>
              <legend>1. Choisissez un pack</legend>
              {PACKS.map((p) => (
                <label key={p.id} className={`rc-pack${pack === p.id ? ' on' : ''}`}>
                  <input type="radio" name="pack" value={p.id} checked={pack === p.id} onChange={() => { setPack(p.id); setError(null) }} />
                  <b>{jetons(p.jetons)} jetons</b>
                  <span>{fcfa(p.fcfa)}</span>
                  <small>{perJeton(p)} FCFA le jeton</small>
                </label>
              ))}
            </fieldset>

            <fieldset className="rc-payer" disabled={step === 'code' || busy}>
              <legend>2. Votre numéro Mobile Money</legend>
              {COUNTRY_LIST.length > 1 && (
                <Segment label="Pays" value={country} onChange={chooseCountry} options={COUNTRY_LIST.map((k) => ({ id: k, label: COUNTRIES[k] }))} />
              )}
              <Segment label="Opérateur" value={operator} onChange={(o) => { setOperator(o); setError(null) }} options={c.operators.map((o) => ({ id: o, label: OPERATORS[o] }))} />
              <label className="rc-phone">
                <span>Numéro {OPERATORS[operator]}</span>
                <div>
                  <em aria-hidden="true">+{c.dial}</em>
                  <input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null) }}
                    placeholder={country === 'BF' ? '70 12 34 56' : ''} aria-describedby="rc-phone-n" aria-label={`Numéro ${OPERATORS[operator]}, sans l’indicatif +${c.dial}`} />
                </div>
                <small id="rc-phone-n">{c.digits} chiffres, sans l’indicatif. Le paiement est demandé sur ce numéro.</small>
              </label>
            </fieldset>

            {step === 'code' && (
              <fieldset className="rc-code">
                <legend>3. Code de paiement Orange Money</legend>
                <p>Orange Burkina demande un code à usage unique, valable quelques minutes et lié au montant de {fcfa(selected.fcfa)}.</p>
                <Steps lines={codeSteps.length ? codeSteps : ['Composez le code USSD indiqué par Orange Money pour obtenir un code de paiement.']} />
                <label className="rc-phone">
                  <span>Code reçu</span>
                  <div><input ref={codeInput} value={code} onChange={(e) => { setCode(e.target.value); setError(null) }} autoComplete="one-time-code" inputMode="text" maxLength={16} spellCheck={false} /></div>
                </label>
              </fieldset>
            )}

            {error && <p className="rc-err" role="alert">{error}</p>}

            <div className="rc-actions">
              <button type="submit" className="rc-pay" disabled={busy}>
                {busy ? 'Un instant…' : step === 'code' ? `Payer ${fcfa(selected.fcfa)}` : `Continuer · ${fcfa(selected.fcfa)}`}
              </button>
              {step === 'code' && <button type="button" className="rc-ghost" onClick={() => reset()}>Modifier</button>}
            </div>
            <p className="rc-note">Paiement ponctuel, sans abonnement. Le prix est fixé par le studio : vous ne payez que le montant affiché.</p>
          </form>
        )}

        <History items={history} onOpen={(t) => { setTopup(t); setStep('wait') }} />
      </main>
    </div>
  )
}
