# syntax = docker/dockerfile:1

# One Node process serves everything: the Vite-built 3D client from
# client/dist, the JSON API, and README.md rendered at /readme/. It listens on
# 0.0.0.0:$PORT (fly.toml sets PORT) and keeps its SQLite file at
# $DATABASE_PATH, which fly.toml points at the /data volume.

FROM docker.io/library/node:24.21.0-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r --if-present build

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --filter . --ignore-scripts
COPY server/ server/
COPY README.md ./
COPY --from=build /app/client/dist client/dist
ENV NODE_ENV=production
CMD ["node", "server/main.ts"]
