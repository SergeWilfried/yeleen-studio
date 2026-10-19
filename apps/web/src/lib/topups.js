/**
 * Recharges Mobile Money côté interface : libellés, messages d'erreur et petites règles d'affichage, sans React ni navigateur.
 * La recharge elle-même (prix, référence, crédit) est décidée par l'API (`/topups`) ; ici, on ne fait que la présenter.
 */
import { PACKS, TOPUP_COUNTRIES } from '@studio/catalog/packs'

export { PACKS, TOPUP_COUNTRIES }

export const OPERATORS = { orange: 'Orange Money', moov: 'Moov Money', wave: 'Wave' }
export const COUNTRIES = { BF: 'Burkina Faso', CI: 'Côte d’Ivoire', SN: 'Sénégal' }

/** Pays proposés : ceux que l'API accepte (`TOPUP_COUNTRIES` côté serveur, « BF » par défaut). */
export const topupCountries = (value) => {
  const list = (value ?? 'BF').split(',').map((s) => s.trim().toUpperCase()).filter((k) => TOPUP_COUNTRIES[k])
  return list.length ? list : ['BF']
}

export const fcfa = (n) => `${n.toLocaleString('fr-FR')} FCFA`

export const STATUS = {
  pending: 'En attente',
  awaiting_code: 'Code à saisir',
  processing: 'En cours',
  completed: 'Réussie',
  failed: 'Échouée',
  expired: 'Expirée',
}
/** Statuts où l'on attend encore paygate. Échouée ou expirée reste affichable : un paiement en retard peut encore aboutir. */
export const isOpen = (t) => t?.status === 'pending' || t?.status === 'awaiting_code' || t?.status === 'processing'
export const isFinal = (t) => t?.status === 'completed' || t?.status === 'failed' || t?.status === 'expired'

/** Consignes de paygate (`{ fr: [...], en: [...] }`, une liste ou un texte) → lignes à afficher, en français d'abord. */
export function lines(instructions) {
  if (!instructions) return []
  const v = Array.isArray(instructions) || typeof instructions === 'string' ? instructions : instructions.fr ?? instructions.en ?? []
  return (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x.trim())
}

/**
 * Codes USSD cités dans les consignes (« Composez *144*4*6*5000# »), pour un lien « Composer ». On ne les écrit jamais en dur :
 * ils viennent de l'opérateur, via paygate, et peuvent changer.
 */
export function ussdCodes(text) {
  const all = (Array.isArray(text) ? text.join(' ') : text ?? '').match(/[*#][0-9*#]{2,}#/g) ?? []
  return [...new Set(all)]
}
/** Lien d'appel d'un code USSD : `#` doit être encodé (`%23`), sinon le téléphone coupe le numéro. */
export const telHref = (code) => `tel:${code.replace(/#/g, '%23')}`

/** Échéance paygate en millisecondes (date ISO, millisecondes ou secondes), ou null. */
export function expiryMs(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

/** Temps restant en « 14:05 », ou null une fois l'échéance passée. */
export function countdown(expiresAt, now = Date.now()) {
  const end = expiryMs(expiresAt)
  if (end == null) return null
  const s = Math.floor((end - now) / 1000)
  if (s <= 0) return null
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Numéro masqué pour l'historique : « +226 •• •• 34 56 ». */
export function maskPhone(e164) {
  const d = String(e164 ?? '').replace(/\D/g, '')
  const c = Object.values(TOPUP_COUNTRIES).find((x) => d.startsWith(x.dial) && d.length === x.dial.length + x.digits)
  if (!c) return e164 ?? ''
  const local = d.slice(c.dial.length)
  return `+${c.dial} ${'•'.repeat(local.length - 4).replace(/(..)/g, '$1 ').trim()} ${local.slice(-4, -2)} ${local.slice(-2)}`
}

const MESSAGES = {
  payments_not_configured: 'Les recharges ne sont pas encore ouvertes. Réessayez plus tard.',
  unsupported_country: 'Les recharges ne sont pas encore disponibles dans ce pays.',
  invalid_operator: 'Cet opérateur n’est pas proposé dans ce pays.',
  invalid_phone: 'Vérifiez le numéro : il doit compter {digits} chiffres, sans l’indicatif.',
  unknown_pack: 'Ce pack n’existe plus. Choisissez-en un autre.',
  invalid_pre_auth_code: 'Ce code n’a pas le bon format. Recopiez le code reçu par SMS (lettres et chiffres).',
  too_many_open: 'Vous avez déjà {max} recharges en cours. Attendez qu’elles se terminent avant d’en lancer une autre.',
  cannot_retry: 'Cette recharge est déjà lancée : suivez-la ci-dessous.',
  amount_too_low: 'Ce montant est inférieur au minimum accepté par l’opérateur ({min}).',
  amount_too_high: 'Ce montant dépasse le maximum accepté par l’opérateur ({max}).',
  unavailable: 'Ce moyen de paiement n’est pas disponible pour ce numéro en ce moment.',
  provider: 'Le service de paiement ne répond pas. Rien n’a été débité : réessayez dans un instant.',
  unreachable: 'Impossible de joindre le studio. Vérifiez votre connexion, puis réessayez.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous, puis réessayez.',
  not_found: 'Recharge introuvable.',
  not_created: 'Le paiement n’a pas pu être lancé. Rien n’a été débité.',
}

/**
 * Message lisible pour une erreur de l'API (`ApiError`) ou un code. Les détails (`min`, `max`, nombre de chiffres) sont repris
 * dans le texte. Un code inconnu de paygate garde un message général.
 */
export function errorMessage(err, { country = 'BF', ...details } = {}) {
  const code = typeof err === 'string' ? err : err?.status === 0 ? 'unreachable' : err?.status === 401 ? 'unauthorized' : err?.body?.error ?? err?.message
  const d = { ...details, ...(typeof err === 'string' ? {} : err?.body) }
  const text = MESSAGES[code] ?? 'Le paiement n’a pas pu être lancé. Vérifiez vos informations, puis réessayez.'
  return text
    .replace('{digits}', String(TOPUP_COUNTRIES[country]?.digits ?? 8))
    .replace('{max}', code === 'too_many_open' ? String(d.max ?? 3) : d.max != null ? fcfa(d.max) : '')
    .replace('{min}', d.min != null ? fcfa(d.min) : '')
}

/** Raison d'un échec affichée à l'utilisateur : le texte de l'opérateur (déjà lisible) ou notre propre code traduit. */
export const failureText = (failure) => (!failure ? 'Le paiement n’a pas abouti.' : MESSAGES[failure] ?? String(failure))

/** Le pack est-il dans les limites renvoyées par `/topups/options` ? Sinon, le code d'erreur à montrer. */
export function limitError(options, amount) {
  if (!options) return null
  if (options.available === false) return 'unavailable'
  if (typeof options.min === 'number' && amount < options.min) return 'amount_too_low'
  if (typeof options.max === 'number' && amount > options.max) return 'amount_too_high'
  return null
}
