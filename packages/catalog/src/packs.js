/**
 * Packs de jetons achetés en FCFA par Mobile Money (via paygate). Recharges ponctuelles : pas d'abonnement.
 * Le prix d'un pack vient toujours d'ici côté serveur, jamais du navigateur.
 */
export const PACKS = [
  { id: 'decouverte', fcfa: 1000, jetons: 30 },
  { id: 'createur', fcfa: 5000, jetons: 160 },
  { id: 'studio', fcfa: 20000, jetons: 680 },
]

export const findPack = (id) => PACKS.find((p) => p.id === id) ?? null

/** Pays et opérateurs de recharge. Wave n'existe qu'en Côte d'Ivoire et au Sénégal. */
export const TOPUP_COUNTRIES = {
  BF: { dial: '226', digits: 8, operators: ['orange', 'moov'] },
  CI: { dial: '225', digits: 10, operators: ['orange', 'wave', 'moov'] },
  SN: { dial: '221', digits: 9, operators: ['orange', 'wave'] },
}

/**
 * Numéro au format E.164 (« +22670123456 ») ou null. Accepte « 70 12 34 56 », « 0022670123456 » ou « +226 70… »
 * pour le pays donné ; un indicatif d'un autre pays est refusé.
 */
export function toE164(phone, country) {
  const c = TOPUP_COUNTRIES[country]
  if (!c || typeof phone !== 'string') return null
  let d = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('00')) d = d.slice(2)
  if (d.length === c.dial.length + c.digits && d.startsWith(c.dial)) d = d.slice(c.dial.length)
  return d.length === c.digits ? `+${c.dial}${d}` : null
}
