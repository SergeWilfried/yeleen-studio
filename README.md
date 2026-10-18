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

## Écrans masqués (MVP : studio Cinéma)

Le MVP est le studio Cinéma, avec la bibliothèque. Image, Vidéo, Audio, Spot pub et Marque sont **éteints par défaut** dans la version construite : absents de la navigation, de « Envoyer vers » et de la barre latérale, et leurs adresses (`/image`, `/video`, `/audio`, `/spot`, `/brand`) renvoient au studio.

- Pour en allumer, construire avec `VITE_FEATURES` (liste séparée par des virgules, ou `all`) : `VITE_FEATURES=image,video pnpm build`. Dans Cloudflare : variable de **build**, comme `VITE_CLERK_PUBLISHABLE_KEY`.
- En développement, `apps/web/.env.development` allume tout. Pour voir ce que voient les utilisateurs : `VITE_FEATURES= pnpm dev`.
- Drapeaux : `image`, `video`, `audio`, `spot`, `brand`, et `catalog` (la Bibliothèque Yeleen, voir plus bas), dans `apps/web/src/lib/features.js`. C'est de la présentation, pas une protection : l'API accepte toujours les mêmes demandes (la garde d'accès, c'est Clerk).

## Fenêtre de choix des références (Cinéma)

Trois entrées dans la barre latérale : **Ma bibliothèque** (tout ce qui est à moi, importé ou généré ; filtre par origine et par type), **Bibliothèque Yeleen** (personnages, objets et vidéos proposés à tous) et **Favoris** (les éléments marqués d'une étoile, de l'une ou l'autre bibliothèque).

- La Bibliothèque Yeleen est derrière le drapeau `catalog` (éteint par défaut en production). Son contenu est `apps/web/public/catalog/yeleen.json` (ou l'adresse `VITE_CATALOG_URL` : un bucket R2 derrière le CDN). Les entrées actuelles sont des **exemples** fabriqués par l'application (`placeholder: true`, étiquetés « Exemple ») : pour de vrais contenus, ajoutez `url` (png, jpg, webp ou mp4) et, pour une vidéo, `secs`, puis retirez `placeholder`.
- Les **objets 3D** sont des images (rendus sur fond transparent) ou de courtes vidéos : aucun de nos modèles n'accepte un fichier 3D.
- Jointe à un prompt, une entrée Yeleen se comporte comme n'importe quelle référence (`@`, rôles par modèle) mais n'entre pas dans Ma bibliothèque. Les favoris Yeleen sont gardés dans le navigateur (`studio.catalog.favs.v1`), comme le reste de la bibliothèque.
- Avant d'y mettre de vrais contenus : droits d'utilisation et de redistribution, et pas de photos de personnes réelles sans autorisation écrite.

## Connexion (Clerk)

Les écrans de création et toute l'API exigent une session Clerk ; un compte = un portefeuille de jetons et ses générations (`sub` du jeton).

- **Créer l'application Clerk** (tableau de bord Clerk) : notez la *clé publique* (`pk_…`) et l'*adresse de l'instance* (« Frontend API URL », `https://xxx.clerk.accounts.dev`). La clé secrète (`sk_…`) n'est pas utilisée : l'API vérifie les jetons avec les clés publiques de l'instance.
- **Site** : variable de build `VITE_CLERK_PUBLISHABLE_KEY`. Sans elle, le site se construit sans connexion (pas de garde) : en local c'est permis (avertissement), mais en intégration continue (Cloudflare, `CI`) la construction échoue avec la marche à suivre ; `VITE_ALLOW_NO_AUTH=1` pour le vouloir. Dans Cloudflare, c'est une variable de **build** (Paramètres → Build → Variables et secrets), pas une variable d'exécution du Worker : celle-ci n'est pas visible à la construction.
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
- Les configurations : `wrangler.jsonc` (site, à la racine) et `apps/api/wrangler.jsonc` (API). Les deux sont en `.jsonc` à dessein : wrangler 4 prend le fichier `.jsonc` le plus proche et ignorerait un `wrangler.toml` dans `apps/api` au profit de celui de la racine (le site serait alors publié à la place de l'API). Les scripts passent aussi `-c` explicitement.
- Le script refuse de déployer sans les réglages Clerk (`--no-auth` pour passer outre, à vos risques : l'API refusera tout).
- Le site peut aussi se déployer depuis Git (Workers Builds) : la commande de déploiement `npx wrangler deploy` suffit, car `wrangler.jsonc` construit le site lui-même (`pnpm build`). Pour que le site appelle l'API, définissez la variable de build `VITE_API_URL` dans Cloudflare ; sans elle, il garde le moteur simulé.


## Base de données (D1)

D1 tient le profil, l'historique et la bibliothèque. **Le portefeuille et l'état des générations en cours restent dans le Durable Object** du compte (un seul écrivain pour l'argent) ; D1 en reçoit des copies, écrites sans bloquer la requête : une panne de D1 n'empêche jamais une génération ni un débit.

| Table | Contenu | Migration |
|---|---|---|
| `users` | un compte Clerk (`sub`), arrivée, dernière activité (au plus toutes les 10 min), pays d'après Cloudflare, e-mail et nom si le jeton les porte, crédit de bienvenue | `0001` |
| `jobs` | historique des générations : modèle, statut, coût, texte, réglages, échec, remboursement, sorties, dates | `0002` |
| `assets` | « Ma bibliothèque » : fichiers importés et générés (clé R2, type, taille, durée, texte, génération d'origine), suppression douce | `0003` |
| `favorites` | favoris des deux bibliothèques : `(utilisateur, mine ou yeleen, élément)` | `0003` |
| `catalog_items` | la Bibliothèque Yeleen (personnages, objets, vidéos), modifiable sans déploiement ; 15 exemples au départ | `0004` |
| `credit_ledger` | journal des jetons, en ajout seulement : un débit, un remboursement ou un crédit par ligne, avec montant signé, solde après et clé d'idempotence (`debit:<génération>`, `refund:<génération>`, `credit:<paiement>`) | `0005` |

**Routes** (toutes derrière la garde Clerk) : `GET /me`, `GET /jobs?limit&before` (historique, page suivante par la date de la dernière reçue), `GET /library?kind&source&limit&before`, `POST /library/uploads` (le corps est le fichier : image, audio 25 Mo au plus, vidéo 100 Mo ; quota `MAX_LIBRARY_BYTES`, 2 Gio par défaut), `PATCH /library/:id` (renommer), `POST /library/delete` et `/library/restore` (suppression douce annulable), `GET /library/favorites?scope=`, `PUT|DELETE /library/favorites/:scope/:id`, `GET /catalog`, `GET /me/ledger?limit&before` (mon historique de jetons) et `GET /me/ledger/audit` (contrôle de mon journal).

- **Génération terminée** : ses sorties copiées dans R2 entrent dans `assets` (une seule fois par sortie) et la réponse du suivi les contient : l'interface les affiche tout de suite.
- **Suppression** : un fichier supprimé est masqué aussitôt et reste annulable ; une tâche planifiée (tous les jours à 3 h 17 UTC) efface pour de bon, dans R2 et dans D1, ce qui est supprimé depuis plus d'un jour.
- **Fichiers** : `/files/library/<utilisateur>/<id>.<ext>` et `/files/outputs/…` se lisent sans en-tête (balises `<img>` et `<video>`) ; la confidentialité tient à l'identifiant non devinable de la clé, pas à une session.
- **Site** : avec l'API et une session, Ma bibliothèque et les favoris Yeleen vivent côté serveur (ils survivent à un rechargement et à un changement d'appareil). Sans API, ou si l'API n'a pas de stockage, tout reste dans le navigateur comme avant.
- `WELCOME_JETONS` (variable de l'API, 0 par défaut) : crédit offert une seule fois à chaque nouvel utilisateur, enregistré dans `users.welcomed_at`.
- E-mail et nom : Clerk ne les met pas dans le jeton de session par défaut ; pour les enregistrer, ajoutez `{"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}"}` dans « Customize session token » (tableau de bord Clerk).
- **Local** : `pnpm dev:api` applique les migrations à la base locale (simulée) avant de démarrer ; `pnpm --filter @studio/api db:migrate:local` le fait seul.
- **Déploiement** : `scripts/deploy.mjs` crée la base `studio` si besoin, écrit son identifiant dans `apps/api/wrangler.jsonc` (à valider dans git), applique les migrations (`migrations/*.sql`), puis déploie l'API. Les tests exécutent les vraies migrations sur SQLite (le moteur de D1) : Node 22.13 ou plus.
- Nouvelle table ou colonne : `apps/api/migrations/0005_….sql` (jamais modifier une migration déjà appliquée).
- **Journal des jetons** : chaque mouvement est d'abord appliqué dans le Durable Object (l'autorité), puis copié dans `credit_ledger`. Une copie manquée (D1 en panne) n'est jamais refaite en double : le **contrôle** rejoue les opérations du Durable Object (qui garde toute la liste de ses opérations), complète les lignes absentes, et signale tout écart de solde, montant divergent ou ligne en trop, sans jamais modifier une ligne existante. Il tourne chaque nuit pour les comptes actifs ces 26 dernières heures (200 au plus par passage), et à la demande par `GET /me/ledger/audit`. Une anomalie est journalisée (`journal des jetons : anomalie`) : c'est le signal à surveiller.
- Pas encore dans D1 : paiements, marque et spots.

### Construction Git de l'API dans Cloudflare

Projet Workers Builds distinct de celui du site : dossier racine `apps/api`, commande de build `pnpm run build` (valide la configuration et regroupe le code), commande de déploiement `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` (les migrations D1 avant le code). À préparer dans Cloudflare avant le premier déploiement :

- le bucket R2 `studio-files` (`pnpm exec wrangler r2 bucket create studio-files`) : sans lui, le déploiement échoue sur la liaison ;
- la base D1 : `pnpm exec wrangler d1 create studio`, puis son identifiant à la place du modèle `00000000-…` dans `apps/api/wrangler.jsonc`, validé dans git ;
- les variables (Paramètres → Variables et secrets) : `ALLOWED_ORIGINS` (adresse du site) et `CLERK_ISSUER`, et le secret `FAL_KEY`. Elles sont conservées d'un déploiement à l'autre (`keep_vars`).
