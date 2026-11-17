# Ubaa web app, built once and served by Caddy (which also proxies /api and handles HTTPS).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "web..." --ignore-scripts \
    && pnpm --filter @erp-platform/contracts build \
    && pnpm --filter @erp-platform/shared-kernel build \
    && pnpm --filter @erp-platform/ui build \
    && VITE_API_BASE_URL=/api pnpm --filter web build

FROM caddy:2.8-alpine
COPY --from=build /app/apps/web/dist /srv
COPY deploy/demo/Caddyfile /etc/caddy/Caddyfile
