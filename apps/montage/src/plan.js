import { ffmpegCommand, srtOf } from '@studio/spot'

/**
 * Ce que le worker exécute pour un plan de montage : fichiers à préparer dans le dossier de travail
 * et commande ffmpeg. Le plan est vérifié avant tout calcul : un plan incomplet est refusé, pas deviné.
 */
export function validateManifest(m) {
  const need = ['duration', 'captions', 'endCard', 'video', 'voice']
  const missing = need.filter((k) => m?.[k] == null)
  if (missing.length) return { ok: false, error: `manifeste incomplet : ${missing.join(', ')}` }
  if (!(m.duration > 0 && m.duration <= 60)) return { ok: false, error: 'durée hors limites (1 à 60 s)' }
  return { ok: true }
}

export function planMontage(m) {
  const v = validateManifest(m)
  if (!v.ok) return v
  return {
    ok: true,
    files: { 'captions.srt': srtOf(m.captions) },
    inputs: ['video.mp4', 'voice.wav', 'endcard.png'], // téléchargés depuis R2 avant l'exécution
    output: 'spot.mp4',
    command: ffmpegCommand(m),
  }
}
