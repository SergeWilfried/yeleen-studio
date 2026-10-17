import { WORKFLOWS, workflowCost } from './workflows.js'

/**
 * Modèles : les workflows fal du studio, présentés comme des cartes. Chaque modèle est un seul lancement (kind 'workflow') :
 * une ou plusieurs photos et, selon le workflow, un texte ; le prix est celui du catalogue des workflows.
 */
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean)

export const RECIPES = WORKFLOWS.map((w) => {
  const textField = w.inputs.find((f) => f.type === 'text')
  return {
    id: `wf-${w.id}`,
    name: w.name,
    blurb: w.blurb,
    icon: 'vid',
    workflow: w,
    photos: w.inputs.filter((f) => f.type !== 'text').map((f) => ({ key: f.key, label: f.label, list: f.type === 'images' })),
    text: textField ? { key: textField.key, label: textField.label, placeholder: textField.placeholder, min: textField.required ? 1 : 0, example: textField.example } : null,
  }
})
export const recipeById = (id) => RECIPES.find((r) => r.id === id)
export const recipeCost = (id) => workflowCost(recipeById(id).workflow)

/** Ce qui manque pour lancer (ou null). */
export function recipeIssue(id, { text = '', photos = {} }) {
  const r = recipeById(id)
  const missing = r.photos.find((p) => !photos[p.key])
  if (missing) return `Ajoutez : ${missing.label.toLowerCase()}.`
  if (r.text && lines(text).length < r.text.min) return `Renseignez : ${r.text.label.toLowerCase()}.`
  return null
}
