/**
 * Voix prêtes à l'emploi des modèles ElevenLabs (paramètre `voice` du schéma fal).
 * Les noms sont ceux des voix préenregistrées ; à confirmer avec le schéma du modèle choisi avant la mise en ligne.
 * `country` : pays de l'accent de la voix (code ISO), d'après la fiche de chaque voix chez ElevenLabs, à confirmer.
 * La voix n'est pas la langue : les modèles multilingues lisent un texte dans n'importe quelle langue prise en charge,
 * la voix en garde l'accent. La langue se règle à part (`language_code`).
 */
export const VOICES = [
  { id: 'Rachel', label: 'Rachel', gender: 'f', country: 'US', trait: 'Posée, claire' },
  { id: 'Aria', label: 'Aria', gender: 'f', country: 'US', trait: 'Expressive, vive' },
  { id: 'Sarah', label: 'Sarah', gender: 'f', country: 'US', trait: 'Douce, rassurante' },
  { id: 'Laura', label: 'Laura', gender: 'f', country: 'US', trait: 'Pétillante, jeune' },
  { id: 'Roger', label: 'Roger', gender: 'm', country: 'US', trait: 'Posé, décontracté' },
  { id: 'George', label: 'George', gender: 'm', country: 'GB', trait: 'Chaleureux, narrateur' },
  { id: 'Charlie', label: 'Charlie', gender: 'm', country: 'AU', trait: 'Naturel, conversationnel' },
  { id: 'Brian', label: 'Brian', gender: 'm', country: 'US', trait: 'Grave, profond' },
]
export const findVoice = (id) => VOICES.find((v) => v.id === id) ?? VOICES[0]
