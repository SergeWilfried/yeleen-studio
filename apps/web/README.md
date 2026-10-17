> Application web du monorepo. Commandes et règles générales : voir le `README.md` à la racine.

# Studio Yeelen — application React + Vite

Maquette interactive en 4 écrans : accueil, vidéo, image et audio.

## Lancer le projet

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production dans dist/
```

## Routes

| Route    | Écran                          |
| -------- | ------------------------------ |
| `/`      | Accueil (galerie, templates)   |
| `/video` | Tableau de bord vidéo          |
| `/image` | Génération d'images            |
| `/audio` | Génération audio               |

## Structure

```
src/
  App.jsx                  routes (react-router-dom)
  pages/                   Home, Video, ImageGen, Audio
  components/              Headers (navigation), PromoBar (bandeau + minuteur)
  lib/                     icons.jsx, gradients.js, useCountdown.js
  styles/                  global.css, shell.css (barre + base des outils), une feuille par page
```

Chaque page porte une classe racine (`home`, `video`, `image`, `audio`) qui sert de portée à sa feuille de style : les noms de classes identiques d'un écran à l'autre ne se mélangent pas.

## À remplacer

- `[MARQUE]`, `[TITRE n]`, `[MONTANT]` : repères à remplacer par votre contenu.
- Les visuels sont des dégradés générés par `lib/gradients.js`. Remplacez `style={{ background: g(i) }}` par une image ou une vidéo.
- Les pseudos, compteurs et noms de voix sont fictifs.

## Interactions déjà en place

Onglets et sélecteurs du panneau vidéo et audio, compteur de sorties (1 à 4), champ de prompt de l'écran image, filtres de la galerie d'accueil, minuteur du bandeau promo.

## Performance : vidéos sur l'accueil

- Les tuiles (`MediaTile`) affichent une **affiche statique** ; la vidéo n'est montée qu'au survol, au focus clavier ou au toucher, et jamais en mode économie de données.
- Les rails et la galerie sous la ligne de flottaison sont montés seulement à l'approche de l'écran (`LazyMount`).
- La galerie affiche 2 rangées, puis « Charger plus ».
- Pour brancher de vraies vidéos, renseignez `VIDEO_SRC` dans `src/pages/Home.jsx` (clés `feat-0`, `tpl-3`, `gal-7`…). Formats : accueil en 4:5 (`.ft4`), rail de templates en 9:16, galerie en 9:16 ou carré, affiches du festival en 16:9. Ajustez le cadrage d'une source qui n'a pas le bon ratio avec la propriété `focus` (object-position) de `MediaTile`. Visez des extraits muets de 6 à 8 s, en ~480p, de moins de 1 Mo, avec des affiches en WebP.

## Composant réutilisable : `ThumbCarousel`

Sélecteur à vignettes (flèches rondes, pastille centrale, élément actif agrandi cerclé de blanc).

```jsx
import ThumbCarousel from './components/ThumbCarousel.jsx'

const [id, setId] = useState(0)
<ThumbCarousel
  items={[{ id: 0, label: 'Exemple 1', poster: 'url(/img/1.webp) center/cover' }, /* … */]}
  value={id}
  onChange={setId}
  size={56}   // diamètre d'une vignette ; le reste s'adapte
  loop        // optionnel : les flèches bouclent
/>
```

Accessible au clavier (flèches gauche/droite), déjà utilisé dans l'onglet « Modifier » de l'écran Vidéo. Il convient aussi aux presets, aux voix, aux exemples d'un template ou aux variantes d'une génération.

## Médias sources

Les originaux lourds (vidéos 4K, photos 8 000 px) sont dans `source-media/`, hors de `src/` : ils ne sont pas embarqués et ne sont pas versionnés (dossier ignoré par git). Les versions légères utilisées par l'application (≤ 1 Mo) sont dans `src/assets/hero/`. Pour en ajouter, exportez en 480p / 900 px (voir la section Performance) avant de les importer.
