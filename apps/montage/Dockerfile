# Contexte de build : la racine du dépôt (docker build -f apps/montage/Dockerfile .)
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/montage ./apps/montage
RUN pnpm install --frozen-lockfile --filter @studio/montage...
ENV PORT=8080
CMD ["node", "apps/montage/src/server.js"]
