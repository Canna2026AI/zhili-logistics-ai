FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS build

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
RUN --mount=type=cache,id=zhili-corepack,target=/corepack pnpm --filter @zhili/worker build
RUN --mount=type=cache,id=zhili-corepack,target=/corepack \
    --mount=type=cache,id=zhili-pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=zhili-pnpm-metadata,target=/root/.cache/pnpm \
    PNPM_CONFIG_PREFER_OFFLINE=true PNPM_CONFIG_TRUST_LOCKFILE=true \
    pnpm --filter @zhili/worker deploy --prod --legacy /prod/worker

FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runtime

LABEL org.opencontainers.image.component="worker"
LABEL org.opencontainers.image.revision="301ec59f33896e123f154b4b01f63ff211d1a05a"

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --gid 10001 zhili \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin zhili \
    && chown 10001:10001 /app

COPY --from=build --chown=10001:10001 /prod/worker/package.json ./package.json
COPY --from=build --chown=10001:10001 /prod/worker/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/apps/worker/dist ./dist

USER 10001:10001
CMD ["node", "dist/main.js"]
