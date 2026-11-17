# Ubaa API for the staging/demo server (cloud mode). Build from the repo root:
#   docker compose -f deploy/demo/docker-compose.yml build
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app
COPY . .
# Only the API and the libraries it uses (no web, no Electron).
RUN pnpm install --frozen-lockfile --filter "api..." \
    && pnpm --filter @erp-platform/contracts build \
    && pnpm --filter @erp-platform/shared-kernel build \
    && pnpm --filter api build
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
COPY deploy/demo/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
