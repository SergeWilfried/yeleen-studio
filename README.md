# Studio Yeelen

Studio de création par IA (image, vidéo, audio, spots publicitaires) pour créateurs et studios en Afrique francophone. Facturation en jetons (FCFA).

```
apps/
  web/        Application React + Vite (aujourd'hui avec un moteur de génération simulé)
  api/        API Cloudflare Worker : tarification serveur, portefeuille de jetons (Durable Object), webhooks fal
  montage/    Worker de montage ffmpeg (Railway)
packages/
  catalog/    Modèles, capacités et prix en jetons, chaînes (workflows fal)
  spot/       Spot pub : script, estimation, plan de montage, commande ffmpeg
docs/
  architecture.html   Architecture de production, outils recommandés et plan de construction
```

## Règles de dépendance

- Les `apps` dépendent des `packages`. Un `package` ne dépend jamais d'une `app`.
- Les `apps` ne s'importent pas entre elles : elles se parlent par HTTP (l'application appelle l'API, l'API appelle le worker).
- `packages/*` sont du JavaScript pur : pas de React, pas d'accès au navigateur ni à Cloudflare. C'est ce qui permet à l'application et aux serveurs de partager le même prix et le même plan de montage.
- Tout ce qui est présentation (icônes, libellés de menus, mise en page) reste dans `apps/web`.
- Le prix qui compte est celui calculé par `apps/api` à partir de `packages/catalog` ; celui de l'application n'est qu'un aperçu.

## Démarrer

Prérequis : Node 20 ou plus, [pnpm](https://pnpm.io) 10.

```bash
pnpm install
pnpm dev            # application web sur http://localhost:5173
pnpm test           # tests des packages et des serveurs
pnpm build          # build de l'application web
pnpm dev:api        # API en local (wrangler)
pnpm dev:montage    # worker de montage en local
```

## État

| Partie | État |
|---|---|
| `apps/web` | Complète côté interface. Image, voix et vidéo (onglet Créer) passent par l'API quand `VITE_API_URL` est défini ; l'édition vidéo et le Spot restent simulés. La bibliothèque est dans le navigateur. |
| `packages/catalog`, `packages/spot` | Utilisés par l'application, testés. |
| `apps/api` | Image, voix et vidéo (onglet Créer) réelles via fal : téléversement des entrées, prix serveur, débit, envoi, suivi, remboursement, annulation, testés. Fichiers générés conservés dans R2. À écrire : édition vidéo, montage du Spot, webhooks, D1, authentification, suppression des fichiers. |
| `apps/montage` | Gabarit : valide un plan et prépare la commande ffmpeg. Le téléchargement, l'exécution et le rappel de l'API restent à écrire. |

Ordre de construction conseillé : voir `docs/architecture.html`.

## Contexte produit

`PRODUCT.md` décrit le positionnement et les principes de design (registre, ton, accessibilité).

## Déploiement (Cloudflare)

Un seul script déploie l'API (Worker, Durable Object, R2) puis le site (fichiers statiques) : `scripts/deploy.mjs`.

```bash
pnpm exec wrangler login            # une fois (ou CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID en intégration continue)
pnpm deploy:dry                     # simulation : construit et valide les deux configurations, ne change rien
FAL_KEY=… pnpm deploy               # premier déploiement : crée le bucket R2, enregistre le secret, déploie API puis site
pnpm deploy                         # ensuite : tests, API, site, autorisation du site dans l'API (CORS), vérifications
```

- `pnpm deploy:check` vérifie l'environnement et lance les tests ; `pnpm deploy:api` et `pnpm deploy:web` déploient une moitié seulement.
- Le site est construit avec l'adresse de l'API (`VITE_API_URL`) ; sans elle, il garde le moteur de génération simulé. Les dernières adresses déployées sont retenues dans `.deploy-state.json` (ignoré par git) ; `--api-url=…` et `--web-origin=…` les remplacent (domaines personnalisés).
- La clé fal n'est lue que dans la variable d'environnement `FAL_KEY` au moment de l'enregistrer comme secret Cloudflare ; elle n'est ni affichée ni écrite sur disque.
- Les configurations : `wrangler.jsonc` (site, à la racine) et `apps/api/wrangler.toml` (API). Les scripts passent toujours `-c` : sans lui, wrangler 4 prend le fichier de la racine même depuis `apps/api`.
- Le site peut aussi se construire depuis Git (Workers Builds) : commande de build `pnpm build`, déploiement `npx wrangler deploy`.

