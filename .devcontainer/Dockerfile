FROM mcr.microsoft.com/devcontainers/base:dev-ubuntu22.04

RUN \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  --mount=type=cache,target=/var/cache/apt,sharing=locked \
  apt-get update && apt-get install -y git-filter-repo

RUN \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  --mount=type=cache,target=/var/cache/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
  libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
  libnspr4 libnss3 libpango-1.0-0 libwayland-client0 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
  libxfixes3 libxkbcommon0 libxrandr2 \
  libfontconfig1 libfreetype6 \
  fonts-liberation fonts-noto-color-emoji fonts-unifont \
  fonts-ipafont-gothic fonts-wqy-zenhei fonts-freefont-ttf

# VA-API userspace drivers + diagnostic tool so VAAPI benchmarks work inside dev.
# mesa-va-drivers   : AMD / generic software fallback (radeonsi, nouveau, virgl)
# intel-media-va-driver-non-free : iHD driver for Intel Gen 8+ (Broadwell+)
# i965-va-driver    : legacy iHD for Intel Gen 4–7
# libva-drm2        : DRM backend for libva (explicit, pulled transitively anyway)
# vainfo            : diagnostic binary — run `vainfo` to verify driver + codec caps
RUN \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  --mount=type=cache,target=/var/cache/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends \
  mesa-va-drivers \
  intel-media-va-driver-non-free \
  i965-va-driver \
  libva-drm2 \
  vainfo
