FROM node:22.22.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN --mount=type=cache,id=zhili-corepack,target=/corepack \
    corepack enable && corepack prepare pnpm@11.5.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=zhili-corepack,target=/corepack \
    --mount=type=cache,id=zhili-pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile --trust-lockfile --prefer-offline

COPY . .
RUN --mount=type=cache,id=zhili-corepack,target=/corepack \
    --mount=type=cache,id=zhili-pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --trust-lockfile
RUN --mount=type=cache,id=zhili-corepack,target=/corepack pnpm --filter @zhili/api build
RUN --mount=type=cache,id=zhili-corepack,target=/corepack \
    --mount=type=cache,id=zhili-pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=zhili-pnpm-metadata,target=/root/.cache/pnpm \
    PNPM_CONFIG_PREFER_OFFLINE=true PNPM_CONFIG_TRUST_LOCKFILE=true \
    pnpm --filter @zhili/api deploy --prod --legacy /prod/api

FROM node:22.22.0-bookworm-slim AS runtime

LABEL org.opencontainers.image.component="api"
LABEL org.opencontainers.image.revision="301ec59f33896e123f154b4b01f63ff211d1a05a"

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --gid 10001 zhili \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin zhili \
    && chown 10001:10001 /app

COPY --from=build --chown=10001:10001 /prod/api/package.json ./package.json
COPY --from=build --chown=10001:10001 /prod/api/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/apps/api/dist ./dist
COPY --from=build --chown=10001:10001 /workspace/infra/scripts/migrate.mjs ./infra/scripts/migrate.mjs
COPY --from=build --chown=10001:10001 /workspace/infra/postgres/init/00-roles.sql ./infra/postgres/init/00-roles.sql
COPY --from=build --chown=10001:10001 /workspace/packages/db/migrations ./packages/db/migrations

USER 10001:10001
CMD ["node", "dist/main.js"]
