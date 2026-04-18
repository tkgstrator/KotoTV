# Theme files

Each theme lives in its own CSS file under this directory. A theme is a complete visual unit — palette, shape scale, typography stack — scoped to `:root[data-theme="<name>"]`.

## Current themes

- `tech.css` — diagnostic dense, monospace on status, status-forward. Active for the project as of 2026-04-17. Anchor mocks: `docs/mocks/{states/v3,epg/v4,live-player/v10,recording-player/v12,recordings/v10,settings/v12,app-shell/v12}`.

## Adding a new theme

1. Copy `tech.css` to `<name>.css` and change every selector to `:root[data-theme="<name>"]` (+ `.dark` variant).
2. Override the full palette (`--background`, `--foreground`, `--card` ... `--ring`) AND shape (`--radius`, `--radius-status`, `--radius-action`) AND typography (`--font-mono`, `--font-sans`, `--text-status`, `--tracking-status`). Partial themes break consistency — see `docs/design/themes.md`.
3. Add `@import './themes/<name>.css';` to `packages/client/src/index.css`.
4. Switch the active theme at runtime by setting `document.documentElement.dataset.theme = '<name>'` (or statically in `index.html`).
5. Verify visually against every locked mock (`docs/mocks/**`). A theme is valid only if every screen still renders legibly.

## What lives here vs index.css

- **Here** — values that differ between themes (colors, fonts, radii, status typography).
- **index.css** — Tailwind import, theme file imports, base body rules, Tailwind `@theme inline` color aliases that bridge Tailwind utilities to the CSS vars themes set.

Tailwind's `@theme inline` declarations in `index.css` are theme-invariant: `--color-background: var(--background)` means "the `bg-background` utility always reads whatever `--background` is right now", regardless of which theme is active.
