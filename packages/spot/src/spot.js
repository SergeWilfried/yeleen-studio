import { AUDIO_MODELS, IMAGE_MODELS, VIDEO_MODELS, durationOptions, imageCost, videoCost, voiceCost } from '@studio/catalog'

/**
 * Spot pub : un brief (entreprise, offre, photo, WhatsApp, ton) devient une pub verticale 9:16 avec voix off,
 * sous-titres et carte finale. Les modèles sont choisis pour le coût : LTX 2.5 Fast (vidéo), Nano Banana Pro (visuel,
 * seulement s'il n'y a pas de photo), ElevenLabs v3 (voix). Le montage final (ffmpeg) tourne côté serveur.
 */
export const VOICE_MODEL = AUDIO_MODELS[0]
export const VIDEO_MODEL = VIDEO_MODELS.find((m) => m.id === 'ltx-2-5-fast')
export const IMAGE_MODEL = IMAGE_MODELS[0]
export const MONTAGE_COST = 0.5 // CPU du montage et stockage du fichier final
export const FCFA_PER_JETON = 33 // prix indicatif d'un jeton (formule Pro)

export const TONES = [{ id: 'warm', label: 'Chaleureux' }, { id: 'bold', label: 'Dynamique' }, { id: 'premium', label: 'Premium' }]
export const LANGS = [{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }]
export const VOICES = [{ id: 'Rachel', label: 'Rachel' }, { id: 'Aria', label: 'Aria' }]

const lc = (s) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s)
const clean = (s) => s.trim().replace(/[.!\s]+$/, '')

// Trois lignes courtes (accroche, corps, appel à l'action) pour tenir en 8 à 10 s de voix ; `variant` change la formulation.
// Remplaçable par un LLM (Workers AI) : la signature reste la même.
const at = (lang, n) => (lang === 'fr' ? (/^chez\s/i.test(n) ? n : `Chez ${n}`) : /^at\s/i.test(n) ? n : `At ${n}`)
const COPY = {
  fr: {
    warm: {
      hook: [(n, o, l) => `${at(l, n)}, ${o}.`, (n, o) => `${n} vous présente : ${o}.`],
      body: [(p) => (p ? `${p}. Profitez-en !` : 'Une qualité qui fait la différence.'), (p) => (p ? `Pour vous : ${p}.` : 'Du soin dans chaque détail.')],
      cta: ['Écrivez-nous sur WhatsApp !', 'Un message sur WhatsApp, et c’est réglé.'],
    },
    bold: {
      hook: [(n, o) => `${n} : ${o} !`, (n, o) => `Attention ! ${n}, ${o} !`],
      body: [(p) => (p ? `Seulement ${p}. Foncez !` : 'Vous n’avez jamais vu ça !'), (p) => (p ? `${p}, c’est maintenant !` : 'C’est maintenant ou jamais !')],
      cta: ['Commandez sur WhatsApp !', 'Un clic sur WhatsApp, c’est parti !'],
    },
    premium: {
      hook: [(n, o) => `${n}. ${o[0].toUpperCase() + o.slice(1)}.`, (n, o) => `${n}, ${o}.`],
      body: [(p) => (p ? `${p}. Sans compromis.` : 'L’excellence, dans le moindre détail.'), (p) => (p ? `À partir de ${p}.` : 'Une signature, un standard.')],
      cta: ['Contactez-nous sur WhatsApp.', 'Découvrez-nous sur WhatsApp.'],
    },
  },
  en: {
    warm: {
      hook: [(n, o, l) => `${at(l, n)}, ${o}.`, (n, o) => `${n} brings you ${o}.`],
      body: [(p) => (p ? `${p}. Enjoy!` : 'Quality that makes the difference.'), (p) => (p ? `Just for you: ${p}.` : 'Care in every detail.')],
      cta: ['Message us on WhatsApp!', 'One WhatsApp message and it’s done.'],
    },
    bold: {
      hook: [(n, o) => `${n}: ${o}!`, (n, o) => `Hey! ${n}, ${o}!`],
      body: [(p) => (p ? `Only ${p}. Go!` : 'You have never seen this!'), (p) => (p ? `${p}, right now!` : 'Now or never!')],
      cta: ['Order on WhatsApp!', 'One tap on WhatsApp, let’s go!'],
    },
    premium: {
      hook: [(n, o) => `${n}. ${o[0].toUpperCase() + o.slice(1)}.`, (n, o) => `${n}, ${o}.`],
      body: [(p) => (p ? `${p}. No compromise.` : 'Excellence, down to the detail.'), (p) => (p ? `From ${p}.` : 'A signature, a standard.')],
      cta: ['Contact us on WhatsApp.', 'Find us on WhatsApp.'],
    },
  },
}

export function writeScript({ name, offer, price, tone, lang }, variant = 0) {
  const c = COPY[lang][tone]
  const v = variant % 2
  const n = clean(name) || '…'
  const o = lc(clean(offer)) || '…'
  return [c.hook[v](n, o, lang), c.body[v](clean(price)), c.cta[v]]
}

export const voiceSecs = (lines) => Math.max(3, Math.ceil(lines.join(' ').length / 14))
/** Durée du spot : la plus courte durée acceptée par le modèle qui laisse un peu de marge après la voix. */
export function adSeconds(lines) {
  const picks = durationOptions(VIDEO_MODEL.caps, '720p', 25)
  return picks.find((d) => d >= voiceSecs(lines) + 1) ?? picks[picks.length - 1]
}

export function estimate(lines, hasPhoto) {
  const secs = adSeconds(lines)
  const parts = [
    ...(hasPhoto ? [] : [{ id: 'image', label: 'Visuel du produit', cost: imageCost(IMAGE_MODEL, '1K', 1) }]),
    { id: 'voice', label: 'Voix off', cost: voiceCost(VOICE_MODEL, lines.join(' ').length) },
    { id: 'video', label: `Vidéo ${secs} s`, cost: videoCost(VIDEO_MODEL, secs, '720p') },
    { id: 'montage', label: 'Montage et export', cost: MONTAGE_COST },
  ]
  const total = Math.round(parts.reduce((s, p) => s + p.cost, 0) * 10) / 10
  return { parts, total, secs }
}

export const digits = (s) => s.replace(/\D/g, '')
export function validateBrief(b, lines) {
  const e = {}
  if (clean(b.name).length < 2) e.name = 'Indiquez le nom de votre entreprise.'
  if (clean(b.offer).length < 8) e.offer = 'Décrivez ce que vous vendez en quelques mots (8 caractères minimum).'
  const d = digits(b.whatsapp)
  if (d.length < 8 || d.length > 15) e.whatsapp = 'Indiquez un numéro WhatsApp avec l’indicatif du pays (8 à 15 chiffres).'
  if (lines.some((l) => !l.trim())) e.script = 'Chaque ligne du script doit être remplie.'
  return e
}

/** Sous-titres : les lignes se partagent la durée de la voix, au prorata de leur longueur. */
export function captionsFrom(lines, vSecs) {
  const total = lines.reduce((s, l) => s + l.length, 0)
  let t = 0.4
  return lines.map((text) => {
    const len = (text.length / total) * (vSecs - 0.4)
    const c = { start: Math.round(t * 100) / 100, end: Math.round((t + len) * 100) / 100, text }
    t += len
    return c
  })
}

/** Le plan de montage lu par le worker (Railway) : pistes, sous-titres, carte finale. */
export function buildManifest({ brief, lines, secs, video, voice, brand }) {
  const vSecs = voice.secs ?? voiceSecs(lines)
  return {
    version: 1,
    title: clean(brief.name),
    format: '9:16',
    resolution: '1080x1920',
    fps: 25,
    duration: secs,
    video: { seed: video.seed, art: video.art, endpoint: VIDEO_MODEL.endpoint },
    voice: { seed: voice.seed, secs: vSecs, voice: brief.voice, language: brief.lang, endpoint: VOICE_MODEL.endpoint },
    music: null,
    brand: brand ?? null, // couleurs et logo de la carte finale
    captions: captionsFrom(lines, vSecs),
    endCard: { start: Math.max(secs - 2, vSecs), end: secs, title: clean(brief.name), offer: clean(brief.offer), price: clean(brief.price), whatsapp: digits(brief.whatsapp) },
    script: lines.join(' '),
  }
}

export const srtOf = (captions) => {
  const f = (t) => { const ms = Math.round(t * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}` }
  return captions.map((c, i) => `${i + 1}\n${f(c.start)} --> ${f(c.end)}\n${c.text}\n`).join('\n')
}

/** La commande de montage que le worker exécute à partir du plan (à valider sur le worker). */
export const ffmpegCommand = (m) => `ffmpeg -i video.mp4 -i voice.wav -loop 1 -t ${m.endCard.end - m.endCard.start} -i endcard.png \\
 -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,\\
subtitles=captions.srt:force_style='Bold=1,FontSize=18,Outline=2,Alignment=2,MarginV=300'[v0];\\
[2:v]format=yuva420p,fade=in:st=0:d=0.4:alpha=1,setpts=PTS+${m.endCard.start}/TB[ec];\\
[v0][ec]overlay=enable='gte(t,${m.endCard.start})'[v];\\
[1:a]loudnorm=I=-16:TP=-1.5,apad=pad_dur=${m.duration}[a]" \\
 -map "[v]" -map "[a]" -t ${m.duration} -r ${m.fps} -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \\
 -c:a aac -b:a 128k -movflags +faststart spot.mp4`
