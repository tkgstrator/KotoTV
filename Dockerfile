# ─── Build argument: hardware acceleration backend ────────────────────────────
# Values: none | nvenc | qsv | vaapi
# Default: none (software encode, Alpine + ffmpeg package)
#
# Build examples:
#   docker buildx build .                             # none (default)
#   docker buildx build --build-arg HW_ACCEL=nvenc . # NVIDIA NVENC
#   docker buildx build --build-arg HW_ACCEL=qsv  . # Intel QSV
#   docker buildx build --build-arg HW_ACCEL=vaapi . # VA-API / Mesa
ARG HW_ACCEL=none

# ─── Stage 1: Install all workspace dependencies ──────────────────────────────
# Always on Alpine; no hardware libs needed for dependency installation.
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace manifests first for layer caching.
COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN bun install --frozen-lockfile

# ─── Stage 2: Build the Vite client ───────────────────────────────────────────
FROM deps AS client-build

COPY packages/client packages/client

RUN bun run --cwd packages/client build

# ─── Stage 3a: runtime-none — Alpine + software FFmpeg ────────────────────────
FROM oven/bun:1-alpine AS runtime-none

RUN apk add --no-cache ffmpeg

# ─── Stage 3b: runtime-nvenc — NVIDIA CUDA base + FFmpeg with nvenc ───────────
# Uses nvidia/cuda Ubuntu image; Bun is installed manually to keep it slim.
# Required on host: nvidia-container-toolkit, driver >= 520.
FROM nvidia/cuda:12.4.1-base-ubuntu22.04 AS runtime-nvenc

# Install Bun (matches the version used in the official oven/bun image family).
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /var/lib/apt/lists/*

# Install FFmpeg with NVENC support plus the NVENC runtime library.
# libnvidia-encode-* ships with the driver package on the host; inside the
# container we only need the CUDA runtime (already in the base image) and ffmpeg.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ─── Stage 3c: runtime-qsv — Debian slim + Intel QSV / VA-API libs ───────────
# QSV on Linux is layered on top of VA-API via libmfx / oneVPL.
# /dev/dri must be passed through from the host (see compose.qsv.yaml).
FROM debian:bookworm-slim AS runtime-qsv

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        unzip \
        ffmpeg \
        intel-media-va-driver-non-free \
        libva-drm2 \
        libva2 \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /var/lib/apt/lists/*

# ─── Stage 3d: runtime-vaapi — Debian slim + Mesa VA-API (AMD / generic) ─────
# For AMD GPUs and open-source Intel driver. /dev/dri passthrough required.
FROM debian:bookworm-slim AS runtime-vaapi

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        unzip \
        ffmpeg \
        libva-drm2 \
        libva2 \
        mesa-va-drivers \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /var/lib/apt/lists/*

# ─── Stage 4: Final runtime — select base via build arg ───────────────────────
# Docker evaluates the FROM argument at build time; the unused runtime-* stages
# are pruned automatically, so only the selected variant is pulled into the final
# image. This avoids maintaining separate Dockerfiles while keeping each variant
# clean. A single Dockerfile with ARG-based FROM is the recommended pattern over
# per-variant files because CI can build any target with one flag change and the
# stages share the deps / client-build cache regardless of HW_ACCEL value.
FROM runtime-${HW_ACCEL} AS runtime

WORKDIR /app

# Copy workspace node_modules from the deps stage.
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules

# Copy the compiled client assets.
COPY --from=client-build /app/packages/client/dist packages/client/dist

# Copy server source (Bun runs TS directly).
COPY packages/server packages/server

# Generate the Prisma client for the target platform.
# Must run after both node_modules and the schema are present.
RUN bunx prisma generate --schema=packages/server/prisma/schema.prisma

# Ensure HLS and recordings directories exist (tmpfs is mounted over hls at runtime).
RUN mkdir -p /app/data/hls /app/data/recordings

ARG BUILD_VERSION=dev
ENV NODE_ENV=production
ENV BUILD_VERSION=${BUILD_VERSION}
EXPOSE 11575

CMD ["bun", "run", "--cwd", "packages/server", "start"]
