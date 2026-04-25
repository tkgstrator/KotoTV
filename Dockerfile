ARG FFMPEG_VERSION=7.1.1

# ─── Bun binary source for glibc runtimes ───────────────────────────────────
FROM oven/bun:1-slim AS bun-glibc

# ─── Build FFmpeg from source (Debian, all HW accel: nvenc/vaapi/qsv) ──────
# Single build with software (x264/x265) + all HW backends + ARIB B24.
# nvenc uses nv-codec-headers at build time; NVIDIA libs injected at runtime
# via --gpus / NVIDIA Container Toolkit (no CUDA base image needed).
FROM debian:bookworm AS ffmpeg-build

ARG FFMPEG_VERSION
ARG ARIBB24_URL=https://github.com/nkoriyama/aribb24/archive/refs/heads/master.tar.gz

RUN sed -i '/^Components:/ s/$/ non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential nasm pkg-config wget ca-certificates \
    autoconf automake libtool \
    libx264-dev libx265-dev libfdk-aac-dev \
    libva-dev libdrm-dev libvpl-dev \
    libass-dev libfreetype-dev libfontconfig-dev libfribidi-dev libharfbuzz-dev \
    libpng-dev

# Build libaribb24 (ARIB B24 Japanese TV subtitles, not packaged)
RUN wget -qO aribb24.tar.gz "${ARIBB24_URL}" \
    && mkdir aribb24-src && tar xf aribb24.tar.gz -C aribb24-src --strip-components=1 \
    && cd aribb24-src \
    && autoreconf -fiv \
    && ./configure --prefix=/usr \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig

# nv-codec-headers (compile-time only — nvenc uses dlopen at runtime)
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
        --enable-nvenc \
        --enable-vaapi --enable-libdrm \
        --enable-libvpl \
        --enable-shared --disable-static \
        --disable-doc --disable-debug --disable-ffplay \
        --disable-sndio --disable-sdl2 \
        --optflags="-O2" \
    && make -j"$(nproc)" \
    && make install

# Collect only real .so files (not symlinks) for COPY; ldconfig recreates them
RUN mkdir -p /ffmpeg-export/lib /ffmpeg-export/bin \
    && find /usr/lib/x86_64-linux-gnu -maxdepth 1 \
        \( -name 'libav*.so.*.*.*' -o -name 'libsw*.so.*.*.*' -o -name 'libpostproc*.so.*.*.*' \) \
        -exec cp {} /ffmpeg-export/lib/ \; \
    && cp /usr/lib/libaribb24.so.0.0.0 /ffmpeg-export/lib/ \
    && cp /usr/bin/ffmpeg /usr/bin/ffprobe /ffmpeg-export/bin/

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

# ─── Runtime ────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

COPY --from=bun-glibc /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

# Runtime libraries for FFmpeg + all HW accel backends
RUN sed -i '/^Components:/ s/$/ non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
        libx264-164 libx265-199 libfdk-aac2 \
        libass9 libfreetype6 libfontconfig1 libfribidi0 libharfbuzz0b \
        libva2 libva-drm2 libdrm2 libpng16-16 \
        libvpl2 \
        mesa-va-drivers \
        intel-media-va-driver-non-free \
    && rm -rf /var/lib/apt/lists/*

# Custom FFmpeg + libaribb24 (real .so files only; ldconfig creates symlinks)
COPY --from=ffmpeg-build /ffmpeg-export/bin/ /usr/bin/
COPY --from=ffmpeg-build /ffmpeg-export/lib/ /usr/lib/x86_64-linux-gnu/
RUN ldconfig

# NVIDIA Container Toolkit injects GPU libs when --gpus is used
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

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
