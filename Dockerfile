# ─── Stage 1: Install all workspace dependencies ──────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace manifests first for layer caching.
COPY package.json bun.lockb ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN bun install --frozen-lockfile

# ─── Stage 2: Build the Vite client ───────────────────────────────────────────
FROM deps AS client-build

COPY packages/shared packages/shared
COPY packages/client packages/client

RUN bun run --cwd packages/client build

# ─── Stage 3: Production runtime ──────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

# TODO (Phase 2): Install FFmpeg and optional HW codec libraries here.
# Base (software encode only):
#   RUN apk add --no-cache ffmpeg
# NVENC target — build with: docker buildx build --build-arg HW_ACCEL=nvenc .
#   Use a CUDA-enabled base image and install ffmpeg with nvenc support.
# QSV/VAAPI target — build with: docker buildx build --build-arg HW_ACCEL=qsv .
#   RUN apk add --no-cache ffmpeg intel-media-driver libva-drm mesa-va-gallium

WORKDIR /app

# Copy workspace node_modules from the deps stage.
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules

# Copy the compiled client assets.
COPY --from=client-build /app/packages/client/dist packages/client/dist

# Copy shared types and server source (Bun runs TS directly).
COPY packages/shared packages/shared
COPY packages/server packages/server

# Ensure HLS and recordings directories exist (tmpfs is mounted over hls at runtime).
RUN mkdir -p /app/data/hls /app/data/recordings

ENV NODE_ENV=production
EXPOSE 11575

CMD ["bun", "run", "--cwd", "packages/server", "start"]
