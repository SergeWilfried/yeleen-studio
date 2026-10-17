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

## Connexion (Clerk)

Les écrans de création et toute l'API exigent une session Clerk ; un compte = un portefeuille de jetons et ses générations (`sub` du jeton).

- **Créer l'application Clerk** (tableau de bord Clerk) : notez la *clé publique* (`pk_…`) et l'*adresse de l'instance* (« Frontend API URL », `https://xxx.clerk.accounts.dev`). La clé secrète (`sk_…`) n'est pas utilisée : l'API vérifie les jetons avec les clés publiques de l'instance.
- **Site** : variable de build `VITE_CLERK_PUBLISHABLE_KEY`. Sans elle (développement local), pas de garde.
- **API** : variable `CLERK_ISSUER` (l'adresse de l'instance) et `ALLOWED_ORIGINS` (les origines du site : le champ `azp` du jeton doit en faire partie). En production sans `CLERK_ISSUER`, l'API refuse tout (503) : elle ne retombe jamais sur un compte par défaut.
- **Développement** : avec `ENV=dev` et sans `CLERK_ISSUER` dans `.dev.vars`, l'API sert un compte `demo` unique ; avec les deux sites configurés, toute la chaîne est testée pour de vrai.
- Ouvert sans connexion : `/health`, `/files/*` (adresses non devinables, lues par `<img>` et `<video>`) et les webhooks.
- À la déconnexion ou au changement de compte, la bibliothèque et la marque gardées dans le navigateur sont effacées (ordinateur partagé).
- Les nouveaux comptes n'ont pas de jetons en production (le crédit de bienvenue n'existe qu'en `ENV=dev`) : il faut un paiement ou un crédit offert avant d'ouvrir au public.

## Déploiement (Cloudflare)

Un seul script déploie l'API (Worker, Durable Object, R2) puis le site (fichiers statiques) : `scripts/deploy.mjs`.

```bash
pnpm exec wrangler login            # une fois (ou CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID en intégration continue)
pnpm deploy:dry                     # simulation : construit et valide les deux configurations, ne change rien
CLERK_ISSUER=https://xxx.clerk.accounts.dev VITE_CLERK_PUBLISHABLE_KEY=pk_… FAL_KEY=… pnpm deploy   # premier déploiement : bucket R2, secret, API puis site
pnpm deploy                         # ensuite : tests, API, site, autorisation du site dans l'API (CORS), vérifications
```

- `pnpm deploy:check` vérifie l'environnement et lance les tests ; `pnpm deploy:api` et `pnpm deploy:web` déploient une moitié seulement.
- Le site est construit avec l'adresse de l'API (`VITE_API_URL`) ; sans elle, il garde le moteur de génération simulé. Les dernières adresses déployées sont retenues dans `.deploy-state.json` (ignoré par git) ; `--api-url=…` et `--web-origin=…` les remplacent (domaines personnalisés).
- La clé fal n'est lue que dans la variable d'environnement `FAL_KEY` au moment de l'enregistrer comme secret Cloudflare ; elle n'est ni affichée ni écrite sur disque.
- Les configurations : `wrangler.jsonc` (site, à la racine) et `apps/api/wrangler.toml` (API). Les scripts passent toujours `-c` : sans lui, wrangler 4 prend le fichier de la racine même depuis `apps/api`.
- Le script refuse de déployer sans les réglages Clerk (`--no-auth` pour passer outre, à vos risques : l'API refusera tout).
- Le site peut aussi se déployer depuis Git (Workers Builds) : la commande de déploiement `npx wrangler deploy` suffit, car `wrangler.jsonc` construit le site lui-même (`pnpm build`). Pour que le site appelle l'API, définissez la variable de build `VITE_API_URL` dans Cloudflare ; sans elle, il garde le moteur simulé.

