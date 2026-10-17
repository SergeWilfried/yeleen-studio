# @studio/montage

Worker Railway qui assemble un spot à partir de son plan de montage (`@studio/spot`).

- `src/plan.js` : valide le plan et prépare fichiers et commande ffmpeg.
- `src/server.js` : `GET /health`, `POST /jobs`. Renvoie pour l'instant la commande prévue (TODO : exécuter ffmpeg, R2, rappel de l'API).
- `Dockerfile` : image avec ffmpeg. Construire depuis la racine : `docker build -f apps/montage/Dockerfile .`

À protéger par un secret partagé avec l'API avant toute mise en ligne.
