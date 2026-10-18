// Les petits SVG sont intégrés au JavaScript par la construction (data:image/svg+xml,… avec apostrophes et parenthèses) : toute adresse
// d’image placée dans un url(…) doit être entre guillemets, sinon le navigateur rejette la déclaration (logos absents en production).
/** Logo d'un modèle (voir lib/modelLogos.js). Décoratif : le nom du modèle est toujours écrit à côté. */
export default function ModelLogo({ logo, size = 20 }) {
  if (!logo) return null
  return <span className={`ml ${logo.color ? 'color' : 'mono'}`} style={{ '--logo': `url("${logo.src}")`, '--s': `${size}px` }} aria-hidden="true" />
}
