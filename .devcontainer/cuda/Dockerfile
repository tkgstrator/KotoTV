FROM nvidia/cuda:12.9.1-cudnn-runtime-ubuntu24.04

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Keep BuildKit's apt cache mounts populated across builds: docker-clean wipes
# the archives after every install, so drop it and tell apt to keep them.
RUN rm -f /etc/apt/apt.conf.d/docker-clean \
    && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' \
        > /etc/apt/apt.conf.d/keep-cache

# NVIDIA base image is minimal; install the tools required by common-utils,
# Playwright browser deps, VA-API drivers, and subsequent devcontainer features.
# Everything else (uv, zsh, gh, claude-code) is layered on via features.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    DEBIAN_FRONTEND=noninteractive apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-liberation \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        fonts-unifont \
        fonts-wqy-zenhei \
        git \
        git-filter-repo \
        i965-va-driver \
        intel-media-va-driver-non-free \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatomic1 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libfontconfig1 \
        libfreetype6 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libva-drm2 \
        libwayland-client0 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        locales \
        mesa-va-drivers \
        openssh-client \
        sudo \
        tzdata \
        vainfo \
    && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Create the non-root vscode user the devcontainer runs as (remoteUser). The
# NVIDIA base is root-only, so unlike the devcontainers base image we make it
# here with passwordless sudo.
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/bash \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
