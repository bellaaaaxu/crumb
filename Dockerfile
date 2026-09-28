# syntax=docker/dockerfile:1
# Crumb — one organization per instance. Built by `docker compose up --build`.
# The base image is pinned by digest (checked against Docker Hub on 2026-09-27);
# to update Node, change the tag and digest together.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Compilers only in this stage, for platforms where better-sqlite3 has no prebuilt binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY app ./app
COPY themes ./themes
COPY assets/sprites.js ./assets/sprites.js
COPY scripts/backup.mjs scripts/restore.mjs scripts/recover-owner.mjs ./scripts/
# The app code stays read-only for the process; only the data and backup folders are its own.
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/main.mjs"]
