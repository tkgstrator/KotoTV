# ─── Build argument: hardware acceleration backend ────────────────────────────
# Values: none | nvenc | qsv | vaapi
ARG HW_ACCEL=none

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

COPY packages/client packages/client

RUN bun run --cwd packages/client build

# ─── Stage 3: Production-only dependencies ───────────────────────────────────
FROM oven/bun:1-alpine AS prod-deps

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# ─── Stage 4: Prisma generate (uses prod deps + schema) ─────────────────────
FROM prod-deps AS prisma-generate

COPY packages/server/prisma packages/server/prisma

RUN --mount=type=cache,target=/root/.cache/prisma \
    bunx prisma generate --schema=packages/server/prisma/schema.prisma

# ─── Runtime base: none — Alpine + software FFmpeg ───────────────────────────
FROM oven/bun:1-alpine AS runtime-none

RUN --mount=type=cache,target=/etc/apk/cache \
    apk add ffmpeg

# ─── Runtime base: nvenc — NVIDIA CUDA + FFmpeg ──────────────────────────────
FROM nvidia/cuda:12.4.1-base-ubuntu22.04 AS runtime-nvenc

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ffmpeg \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun

# ─── Runtime base: qsv — Intel QSV / VA-API ─────────────────────────────────
FROM debian:bookworm-slim AS runtime-qsv

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ffmpeg \
        intel-media-va-driver-non-free libva-drm2 libva2 \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun

# ─── Runtime base: vaapi — Mesa VA-API (AMD / generic) ───────────────────────
FROM debian:bookworm-slim AS runtime-vaapi

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ffmpeg \
        libva-drm2 libva2 mesa-va-drivers \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun

# ─── Final runtime ───────────────────────────────────────────────────────────
FROM runtime-${HW_ACCEL} AS runtime

WORKDIR /app

# Production node_modules (devDependencies excluded)
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages/server/node_modules packages/server/node_modules

# Generated Prisma client
COPY --from=prisma-generate /app/node_modules/.prisma node_modules/.prisma

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
CMD ["bun", "run", "--cwd", "packages/server", "start"]
