import us from '../assets/flags/us.svg'
import gb from '../assets/flags/gb.svg'
import au from '../assets/flags/au.svg'

/** Drapeau et nom d'un pays (code ISO) : pays de l'accent d'une voix. */
export const FLAGS = {
  US: { src: us, name: 'États-Unis', accent: 'américain' },
  GB: { src: gb, name: 'Royaume-Uni', accent: 'britannique' },
  AU: { src: au, name: 'Australie', accent: 'australien' },
}
export const flagFor = (code) => FLAGS[code] ?? null
