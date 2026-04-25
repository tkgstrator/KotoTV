#!/bin/zsh

sudo chown -R vscode:vscode node_modules
bun install --frozen-lockfile --ignore-scripts
bunx --bun biome migrate --write
sudo apt-get update -qq && sudo apt-get install -y -qq fonts-noto-cjk >/dev/null 2>&1
bunx playwright install chromium
