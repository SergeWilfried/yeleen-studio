# @studio/api

Cloudflare Worker (Hono). Point d'entrée unique pour tout ce qui coûte de l'argent.

- `src/pricing.js` : prix d'une génération à partir de `@studio/catalog`, validation des options.
- `src/inputs.js` : entrée envoyée à fal pour chaque modèle (champs lus dans les schémas OpenAPI de fal) et format commun des sorties.
- `src/fal.js` : client de la file fal (submit, status, result, cancel), sans dépendance.
- `src/wallet.js` : règles des jetons (débit, remboursement, crédit), idempotentes. Sans dépendance, testées.
- `src/storage.js` : copie des sorties dans R2 et lecture par plage.
- `src/account-do.js` : Durable Object, un compte = portefeuille + générations.
- `src/index.js` : routes `GET /wallet`, `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`. À écrire : `/webhooks/fal`, `/webhooks/payments`.
- `wrangler.jsonc` : liaisons (D1, R2, Queues en commentaire jusqu'à création des ressources).

## Générations réelles

Seedance 2.5 (un modèle, trois points d'accès fal choisis selon les entrées : texte, image de départ et de fin, ou références d'images, de vidéos et d'audio, avec prolongation et modification d'une vidéo ; facturé au jeton par fal), image (Nano Banana Pro et 2, Flux 3), voix (ElevenLabs v3, multilingue v2, turbo v2.5) et vidéo de l'onglet Créer (Kling 3.0 Pro, MiniMax H3 Max et Turbo, LTX 2.3 et 2.5, audio vers vidéo) passent par fal. Les images et l'audio d'entrée sont d'abord déposés via `POST /uploads`. Restent simulés dans l'application : l'onglet Modifier de la vidéo (prolonger, modifier…) et le montage du Spot.

1. `cp .dev.vars.example .dev.vars` puis renseignez `FAL_KEY` (jamais dans `apps/web`).
2. `pnpm dev:api` (http://localhost:8787), puis `pnpm dev`. L'application active le mode réel quand `VITE_API_URL` est défini (`apps/web/.env.development`).
3. En développement, un compte neuf reçoit 240 jetons.

Chaque génération réelle est facturée par fal. `MAX_JOB_COST` (150 jetons par défaut) refuse une demande unique trop chère tant qu'il n'y a pas de plafond par compte. Le suivi se fait par interrogation (toutes les 1,5 s).

## Fichiers (R2)

À la fin d'une génération, chaque sortie est copiée dans le bucket `FILES` et servie par `GET /files/outputs/<compte>/<génération>/<n>.<ext>` (cache d'un an, requêtes par plage pour avancer dans une vidéo, CORS). Si la copie échoue, la sortie garde l'adresse temporaire de fal : la génération payée n'est pas perdue. En local, `wrangler dev` simule le bucket (données dans `.wrangler/state`). En production : `wrangler r2 bucket create studio-files`. L'accès se fait par adresse non devinable tant qu'il n'y a pas de comptes ; les fichiers d'entrée (images, audio) restent chez fal le temps de la génération.

```bash
pnpm --filter @studio/api test
pnpm --filter @studio/api dev
```
