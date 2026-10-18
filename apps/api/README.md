# @studio/api

Cloudflare Worker (Hono). Point d'entrée unique pour tout ce qui coûte de l'argent.

- `src/pricing.js` : prix d'une génération à partir de `@studio/catalog`, validation des options.
- `src/inputs.js` : entrée envoyée à fal pour chaque modèle (champs lus dans les schémas OpenAPI de fal) et format commun des sorties.
- `src/fal.js` : client de la file fal (submit, status, result, cancel), sans dépendance.
- `src/wallet.js` : règles des jetons (débit, remboursement, crédit), idempotentes. Sans dépendance, testées.
- `src/storage.js` : copie des sorties dans R2 et lecture par plage.
- `src/paygate.js` : client de paygate (moyens, encaissement, lecture) et vérification de la signature des webhooks.
- `src/topups.js` : règles des recharges (statuts, crédit au montant enregistré, paiements tardifs), sans dépendance, testées.
- `src/mirror.js` : copie dans D1 du grand livre des jetons (`ledger`), des recharges (`topups`), des générations (`jobs`) et des fichiers générés (`assets`), idempotente.
- `src/library.js` : lectures de D1 pour Ma bibliothèque, les favoris et la Bibliothèque Yeleen (`catalog_items`).
- `src/account-do.js` : Durable Object, un compte = portefeuille + générations + recharges.
- `src/index.js` : routes `GET /wallet`, `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `GET /topups/options`, `GET|POST /topups`, `GET /topups/:reference`, `POST /webhooks/payments`, `GET /ledger`, `GET|POST /assets`, `DELETE /assets/:id`, `GET|PUT|DELETE /favorites`, `GET /catalog` (publique). À écrire : `/webhooks/fal`.
- `wrangler.jsonc` : liaisons (D1, R2, Queues en commentaire jusqu'à création des ressources).

## Générations réelles

Seedance 2.5 (un modèle, trois points d'accès fal choisis selon les entrées : texte, image de départ et de fin, ou références d'images, de vidéos et d'audio, avec prolongation et modification d'une vidéo ; facturé au jeton par fal), image (Nano Banana Pro et 2, Flux 3), voix (ElevenLabs v3, multilingue v2, turbo v2.5) et vidéo de l'onglet Créer (Kling 3.0 Pro, MiniMax H3 Max et Turbo, LTX 2.3 et 2.5, audio vers vidéo) passent par fal. Les images et l'audio d'entrée sont d'abord déposés via `POST /uploads`. Restent simulés dans l'application : l'onglet Modifier de la vidéo (prolonger, modifier…) et le montage du Spot.

1. `cp .dev.vars.example .dev.vars` puis renseignez `FAL_KEY` (jamais dans `apps/web`).
2. `pnpm dev:api` (http://localhost:8787), puis `pnpm dev`. L'application active le mode réel quand `VITE_API_URL` est défini (`apps/web/.env.development`).
3. En développement, un compte neuf reçoit 240 jetons.

Chaque génération réelle est facturée par fal. `MAX_JOB_COST` (150 jetons par défaut) refuse une demande unique trop chère tant qu'il n'y a pas de plafond par compte. Le suivi se fait par interrogation (toutes les 1,5 s).

## Recharges Mobile Money (paygate)

Les jetons s'achètent par packs en FCFA (`@studio/catalog/packs`), par Orange, Moov ou Wave, via paygate (`PAYGATE_URL`, `PAYGATE_KEY`, `PAYGATE_WEBHOOK_SECRET`).

1. `GET /topups/options?country=BF&operator=orange&phone=…&pack=…` : disponibilité, limites et `authType` (à demander avant d'afficher le bouton).
2. `POST /topups { pack, country, operator, phone }` : le prix vient du catalogue. Selon `authType` : `PROVIDER_AUTH` (valider sur le téléphone, `instructions`), `REDIRECT_AUTH` (Wave : aller sur `authUrl`), `PREAUTH` (Orange Burkina : la recharge revient en `awaiting_code` avec `codeInstructions` ; renvoyer la même demande avec `reference` et `preAuthCode`).
3. `GET /topups/:reference` toutes les 3–4 s jusqu'à `completed`, `failed` ou `expired` (un paiement échoué ou expiré peut encore aboutir en retard : il est crédité).

paygate confirme par `POST /webhooks/payments` (signature HMAC sur le corps brut, 5 min de tolérance). Le crédit se fait dans le Durable Object, une seule fois par référence, du nombre de jetons enregistré à la création ; un montant différent n'est pas crédité. Si le webhook tarde plus de 30 s, `GET /topups/:reference` lit le paiement chez paygate. Au plus 3 recharges ouvertes par compte (`MAX_OPEN_TOPUPS`).

## Fichiers (R2)

À la fin d'une génération, chaque sortie est copiée dans le bucket `FILES` et servie par `GET /files/outputs/<compte>/<génération>/<n>.<ext>` (cache d'un an, requêtes par plage pour avancer dans une vidéo, CORS). Si la copie échoue, la sortie garde l'adresse temporaire de fal : la génération payée n'est pas perdue. En local, `wrangler dev` simule le bucket (données dans `.wrangler/state`). En production : `wrangler r2 bucket create studio-files`. L'accès se fait par adresse non devinable tant qu'il n'y a pas de comptes ; les fichiers d'entrée (images, audio) restent chez fal le temps de la génération.

```bash
pnpm --filter @studio/api test
pnpm --filter @studio/api dev
```

## Grand livre (D1)

Le Durable Object du compte reste le seul juge du solde. Chaque débit, remboursement et crédit (recharge, bienvenue) est copié dans la table `ledger` de D1 avec le solde qui en résulte, et chaque recharge dans `topups` (migrations `0002` et `0003`). La copie passe par une file gardée dans le Durable Object : si D1 ne répond pas, la requête du client réussit quand même et la file est réécrite à la requête suivante. Au premier passage d'un compte, son historique antérieur est repris (lignes sans solde). Chaque écriture est idempotente. `GET /ledger?limit=&before=` rend l'historique du compte connecté.

## Bibliothèques (D1)

Chaque génération est aussi copiée dans `jobs` (texte, réglages, état, sorties), et chaque sortie gardée dans R2 dans `assets` (migration `0004`), par la même file que le grand livre. `GET /assets?kind=&before=&limit=` rend Ma bibliothèque (adresses `/files/…`), `DELETE /assets/:id` la retire (suppression douce). Les favoris (`favorites`, portées `mine` et `yeleen`) se lisent par `GET /favorites` et se règlent par `PUT|DELETE /favorites/:portée/:id`. La Bibliothèque Yeleen vient de `catalog_items` (migration `0005`) : `GET /catalog`, sans connexion, au format de `public/catalog/yeleen.json` ; le site la lit en réglant `VITE_CATALOG_URL` sur `<API>/catalog`. Les fichiers importés passent par `POST /assets` (corps = le fichier, `name`, `secs`, `width`, `height` en paramètres ; images et audio jusqu'à 25 Mo, vidéos jusqu'à 100 Mo) : écrits dans R2 sous `uploads/<compte>/`, ils entrent dans `assets` (source `upload`) et suivent l'utilisateur sur tous ses appareils. `POST /uploads` reste l'envoi des fichiers d'entrée d'une génération chez fal.
