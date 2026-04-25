# ─── Build argument: hardware acceleration backend ────────────────────────────
# Values: none | nvenc | qsv | vaapi
ARG HW_ACCEL=none

# ─── Bun binary source for non-Alpine runtimes ──────────────────────────────
FROM oven/bun:1-slim AS bun-glibc

# ─── Stage 1: Full install (client build needs devDependencies) ──────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ─── Stage 2: Build the Vite client ──────────────────────────────────────────
FROM deps AS client-build

# tsconfig chain (client extends ../../tsconfig.base.json)
COPY tsconfig.base.json ./
COPY packages/server/tsconfig.json packages/server/

# Server source — client imports types via workspace link
COPY packages/server/src packages/server/src

COPY packages/client packages/client

RUN bun run --cwd packages/client build

# ─── Stage 3: Production-only server dependencies ───────────────────────────
FROM oven/bun:1-alpine AS prod-deps

WORKDIR /app

# Install server deps standalone (no workspace) to avoid pulling client deps
COPY packages/server/package.json ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production

# ─── Stage 4: Prisma generate ───────────────────────────────────────────────
FROM prod-deps AS prisma-generate

COPY packages/server/prisma ./prisma

RUN --mount=type=cache,target=/root/.cache/prisma \
    bunx prisma generate --schema=prisma/schema.prisma

# ─── Stage 5: Prune Prisma Studio / dev-only transitive deps ────────────────
FROM prod-deps AS prod-deps-pruned

# Remove packages not needed at runtime (Studio's pglite, unused DB drivers)
RUN rm -rf node_modules/@electric-sql \
           node_modules/mysql2 \
           node_modules/@types

# ─── Runtime base: none — Alpine + software FFmpeg ───────────────────────────
FROM oven/bun:1-alpine AS runtime-none

RUN --mount=type=cache,target=/etc/apk/cache \
    apk add ffmpeg

# ─── Runtime base: nvenc — NVIDIA CUDA + FFmpeg ──────────────────────────────
FROM nvidia/cuda:12.4.1-base-ubuntu22.04 AS runtime-nvenc

COPY --from=bun-glibc /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends ffmpeg

# ─── Runtime base: qsv — Intel QSV / VA-API ─────────────────────────────────
FROM debian:bookworm-slim AS runtime-qsv

COPY --from=bun-glibc /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg intel-media-va-driver-non-free libva-drm2 libva2

# ─── Runtime base: vaapi — Mesa VA-API (AMD / generic) ───────────────────────
FROM debian:bookworm-slim AS runtime-vaapi

COPY --from=bun-glibc /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libva-drm2 libva2 mesa-va-drivers

# ─── Final runtime ───────────────────────────────────────────────────────────
FROM runtime-${HW_ACCEL} AS runtime

WORKDIR /app

# Production node_modules (server only, Studio/dev deps pruned)
COPY --from=prod-deps-pruned /app/node_modules packages/server/node_modules

# Generated Prisma client
COPY --from=prisma-generate /app/src/generated packages/server/src/generated

# Pre-built client assets
COPY --from=client-build /app/packages/client/dist packages/client/dist

# Server source (Bun runs TS directly)
COPY packages/server packages/server

RUN mkdir -p /app/data/hls /app/data/recordings

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ARG BUILD_VERSION=dev
ENV NODE_ENV=production
ENV BUILD_VERSION=${BUILD_VERSION}
EXPOSE 11575

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "run", "packages/server/src/index.ts"]
