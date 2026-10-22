import { WORKFLOWS, workflowCost, splitLines } from './workflows.js'

/**
 * Modèles : les workflows fal du studio, présentés comme des cartes. Chaque modèle est un seul lancement (kind 'workflow') :
 * une ou plusieurs photos et, selon le workflow, un texte ; le prix est celui du catalogue des workflows.
 */
export const RECIPES = WORKFLOWS.map((w) => {
  const isText = (f) => f.type === 'text' || f.type === 'lines'
  return {
    id: `wf-${w.id}`,
    name: w.name,
    blurb: w.blurb,
    icon: 'vid',
    workflow: w,
    photos: w.inputs.filter((f) => !isText(f)).map((f) => ({ key: f.key, label: f.label, list: f.type === 'images' })),
    texts: w.inputs.filter(isText).map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, min: f.type === 'lines' ? f.min : f.required ? 1 : 0, max: f.max, lines: f.type === 'lines', example: f.example })),
  }
})
export const recipeById = (id) => RECIPES.find((r) => r.id === id)
export const recipeCost = (id) => workflowCost(recipeById(id).workflow)

/** Ce qui manque pour lancer (ou null). */
export function recipeIssue(id, { texts = {}, photos = {} }) {
  const r = recipeById(id)
  const missing = r.photos.find((p) => !photos[p.key])
  if (missing) return `Ajoutez : ${missing.label.toLowerCase()}.`
  const short = r.texts.find((t) => splitLines(texts[t.key]).length < t.min)
  if (short) return short.lines ? `Renseignez au moins ${short.min} villes, une par ligne.` : `Renseignez : ${short.label.toLowerCase()}.`
  const long = r.texts.find((t) => t.lines && splitLines(texts[t.key]).length > t.max)
  if (long) return `${long.max} villes au maximum.`
  return null
}
