import { useCallback, useEffect, useRef, useState } from 'react'

const getRecognition = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined)

const ERRORS = {
  'not-allowed': 'Micro bloqué : autorisez-le dans les réglages du navigateur.',
  'service-not-allowed': 'Micro bloqué : autorisez-le dans les réglages du navigateur.',
  'audio-capture': 'Aucun micro détecté.',
  'no-speech': 'Aucune voix détectée. Réessayez.',
  network: 'Dictée indisponible : vérifiez votre connexion.',
}

/**
 * Dictée vocale (Web Speech API). `start(base)` écoute et appelle `onText(base + dictée)` au fil de la voix,
 * y compris pour les résultats provisoires. Absent de Firefox : `supported` vaut alors false.
 */
export default function useSpeech({ lang = 'fr-FR', onText }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback((base = '') => {
    const Recognition = getRecognition()
    if (!Recognition || rec.current) return
    const r = new Recognition()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    const prefix = base && !/\s$/.test(base) ? `${base} ` : base
    r.onstart = () => { setError(''); setListening(true) }
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      onTextRef.current(prefix + text.trimStart())
    }
    r.onerror = (e) => { if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'La dictée a échoué. Réessayez.') }
    r.onend = () => { rec.current = null; setListening(false) }
    rec.current = r
    try { r.start() } catch { rec.current = null }
  }, [lang])

  useEffect(() => () => rec.current?.abort(), [])

  return { supported: Boolean(getRecognition()), listening, error, start, stop, clearError: () => setError('') }
}
