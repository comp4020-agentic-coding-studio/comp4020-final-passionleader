# syntax = docker/dockerfile:1

# One Node process serves everything: the Vite-built 3D client from
# client/dist, the JSON API, and README.md rendered at /readme/. It listens on
# 0.0.0.0:$PORT (fly.toml sets PORT) and keeps its SQLite file on the /data
# volume that fly.toml mounts. fly.toml sets no DATABASE_PATH, so it's set
# here: without it the file landed in the container's own disk, which is wiped
# on every deploy and every auto-stop, and poops vanished.

FROM docker.io/library/node:24.21.0-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r --if-present build
# Gzipped copies beside the built files, which the server sends to browsers that accept them
# (the 1 MB game bundle goes down at about a third of the size). Music is compressed already.
RUN find client/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.glb' -o -name '*.svg' -o -name '*.json' -o -name '*.webmanifest' -o -name '*.md' \) -exec gzip -9 -k {} +

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --filter . --ignore-scripts
COPY server/ server/
# operator tools, run over flyctl ssh: reset-db.ts and seed-accounts.ts
COPY scripts/reset-db.ts scripts/seed-accounts.ts scripts/
COPY README.md ./
# Seongsu answers from these (server/projectdocs.ts loads them at start).
COPY PROCESS.md CLAUDE.md ./
COPY docs/self-hosting.md docs/roles.md docs/
COPY docs/decisions/ docs/decisions/
COPY reflections/ reflections/
COPY --from=build /app/client/dist client/dist
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/app.db
CMD ["node", "server/main.ts"]
