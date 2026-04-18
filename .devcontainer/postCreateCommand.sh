#!/bin/zsh

sudo chown -R vscode:vscode node_modules
bun install --frozen-lockfile --ignore-scripts
bunx --bun biome migrate --write
bunx playwright install chromium
