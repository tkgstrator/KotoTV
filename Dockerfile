# ─── Build argument: hardware acceleration backend ────────────────────────────
# Values: none | nvenc | qsv | vaapi
ARG HW_ACCEL=none
ARG FFMPEG_VERSION=7.1.1

# ─── Bun binary source for non-Alpine runtimes ──────────────────────────────
FROM oven/bun:1-slim AS bun-glibc

# ─── Build libaribb24 (ARIB B24 Japanese TV subtitles) ──────────────────────
FROM alpine:3.22 AS aribb24-build

ARG ARIBB24_URL=https://github.com/nkoriyama/aribb24/archive/refs/heads/master.tar.gz

RUN apk add --no-cache build-base autoconf automake libtool libpng-dev

RUN wget -qO aribb24.tar.gz "${ARIBB24_URL}" \
    && mkdir aribb24-src && tar xf aribb24.tar.gz -C aribb24-src --strip-components=1 \
    && cd aribb24-src \
    && autoreconf -fiv \
    && ./configure --prefix=/usr \
    && make -j"$(nproc)" \
    && make install

# ─── Build FFmpeg from source (Alpine, for none/vaapi/qsv runtimes) ────────
# x264/x265 software + VA-API/QSV HW accel, AAC, ARIB B24 subtitles, libass.
# nvenc requires glibc — built in ffmpeg-build-glibc stage below.
FROM alpine:3.22 AS ffmpeg-build

ARG FFMPEG_VERSION

RUN apk add --no-cache \
    build-base nasm pkgconf linux-headers \
    x264-dev x265-dev fdk-aac-dev \
    libva-dev onevpl-dev \
    libass-dev freetype-dev fontconfig-dev fribidi-dev harfbuzz-dev \
    libpng-dev libdrm-dev

COPY --from=aribb24-build /usr/lib/libaribb24* /usr/lib/
COPY --from=aribb24-build /usr/include/aribb24 /usr/include/aribb24/
COPY --from=aribb24-build /usr/lib/pkgconfig/aribb24.pc /usr/lib/pkgconfig/

RUN wget -q "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
    && tar xf "ffmpeg-${FFMPEG_VERSION}.tar.xz" \
    && cd "ffmpeg-${FFMPEG_VERSION}" \
    && ./configure \
        --prefix=/usr \
        --enable-gpl --enable-nonfree --enable-version3 \
        --enable-pthreads --enable-pic \
        --enable-libx264 --enable-libx265 \
        --enable-libfdk-aac \
        --enable-libass --enable-libfreetype --enable-libfontconfig \
        --enable-libfribidi --enable-libharfbuzz \
        --enable-libaribb24 \
        --enable-vaapi --enable-libdrm \
        --enable-libvpl \
        --enable-shared --disable-static \
        --disable-doc --disable-debug --disable-ffplay \
        --disable-sndio --disable-sdl2 \
        --optflags="-O2" \
    && make -j"$(nproc)" \
    && make install

# ─── Build FFmpeg from source (Ubuntu/glibc for nvenc runtime) ───────────────
FROM ubuntu:22.04 AS ffmpeg-build-glibc

ARG FFMPEG_VERSION

RUN echo "deb http://archive.ubuntu.com/ubuntu jammy multiverse" \
        > /etc/apt/sources.list.d/multiverse.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential nasm pkg-config wget ca-certificates \
    git autoconf automake libtool \
    libx264-dev libx265-dev libfdk-aac-dev \
    libva-dev libdrm-dev \
    libass-dev libfreetype-dev libfontconfig-dev libfribidi-dev libharfbuzz-dev \
    libpng-dev

ARG ARIBB24_URL=https://github.com/nkoriyama/aribb24/archive/refs/heads/master.tar.gz

# Build libaribb24 for glibc
RUN wget -qO aribb24.tar.gz "${ARIBB24_URL}" \
    && mkdir aribb24-src && tar xf aribb24.tar.gz -C aribb24-src --strip-components=1 \
    && cd aribb24-src \
    && autoreconf -fiv \
    && ./configure --prefix=/usr \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig

# Install nv-codec-headers from source (not packaged on bookworm)
RUN wget -q "https://github.com/FFmpeg/nv-codec-headers/releases/download/n12.2.72.0/nv-codec-headers-12.2.72.0.tar.gz" \
    && tar xf nv-codec-headers-12.2.72.0.tar.gz \
    && cd nv-codec-headers-12.2.72.0 \
    && make install PREFIX=/usr

RUN wget -q "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
    && tar xf "ffmpeg-${FFMPEG_VERSION}.tar.xz" \
    && cd "ffmpeg-${FFMPEG_VERSION}" \
    && ./configure \
        --prefix=/usr \
        --libdir=/usr/lib/x86_64-linux-gnu \
        --enable-gpl --enable-nonfree --enable-version3 \
        --enable-pthreads --enable-pic \
        --enable-libx264 --enable-libx265 \
        --enable-libfdk-aac \
        --enable-libass --enable-libfreetype --enable-libfontconfig \
        --enable-libfribidi --enable-libharfbuzz \
        --enable-libaribb24 \
        --enable-vaapi --enable-libdrm \
        --enable-nvenc \
        --enable-shared --disable-static \
        --disable-doc --disable-debug --disable-ffplay \
        --disable-sndio --disable-sdl2 \
        --optflags="-O2" \
    && make -j"$(nproc)" \
    && make install

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

# ─── Runtime base: none — Alpine + custom FFmpeg ────────────────────────────
FROM oven/bun:1-alpine AS runtime-none

RUN apk add --no-cache \
    x264-libs x265-libs fdk-aac \
    libass freetype fontconfig fribidi harfbuzz \
    libva libdrm libpng onevpl-libs

COPY --from=aribb24-build /usr/lib/libaribb24* /usr/lib/
COPY --from=ffmpeg-build /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/
COPY --from=ffmpeg-build /usr/lib/libav*.so* /usr/lib/
COPY --from=ffmpeg-build /usr/lib/libsw*.so* /usr/lib/
COPY --from=ffmpeg-build /usr/lib/libpostproc*.so* /usr/lib/

# ─── Runtime base: vaapi — Alpine + custom FFmpeg + Mesa VA-API ─────────────
FROM runtime-none AS runtime-vaapi

RUN apk add --no-cache mesa-va-drivers

# ─── Runtime base: qsv — Alpine + custom FFmpeg + Intel QSV ─────────────────
FROM runtime-none AS runtime-qsv

RUN apk add --no-cache intel-media-driver onevpl-libs

# ─── Runtime base: nvenc — NVIDIA CUDA + custom FFmpeg (glibc) ───────────────
FROM nvidia/cuda:12.4.1-base-ubuntu22.04 AS runtime-nvenc

COPY --from=bun-glibc /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    echo "deb http://archive.ubuntu.com/ubuntu jammy multiverse" \
        > /etc/apt/sources.list.d/multiverse.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        libx264-163 libx265-199 libfdk-aac2 \
        libass9 libfreetype6 libfontconfig1 libfribidi0 libharfbuzz0b \
        libva2 libva-drm2 libdrm2 libpng16-16

COPY --from=ffmpeg-build-glibc /usr/lib/libaribb24* /usr/lib/x86_64-linux-gnu/
COPY --from=ffmpeg-build-glibc /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/
COPY --from=ffmpeg-build-glibc /usr/lib/x86_64-linux-gnu/libav*.so* /usr/lib/x86_64-linux-gnu/
COPY --from=ffmpeg-build-glibc /usr/lib/x86_64-linux-gnu/libsw*.so* /usr/lib/x86_64-linux-gnu/
COPY --from=ffmpeg-build-glibc /usr/lib/x86_64-linux-gnu/libpostproc*.so* /usr/lib/x86_64-linux-gnu/

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
