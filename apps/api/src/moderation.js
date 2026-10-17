/** Contrôle minimal du texte avant tout débit : un refus ne coûte rien. À remplacer par une vraie modération. */
const BLOCKED = /interdit|violence|nsfw|sang/i
export const isBlocked = (text) => BLOCKED.test(text ?? '')
