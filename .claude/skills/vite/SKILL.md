---
name: vite
description: Vite conventions for `packages/client`. Covers the current plugin stack, aliasing, dev server proxying, and safe config changes.
---

# Vite

The frontend is built with **Vite** in `packages/client`. The authoritative config is `packages/client/vite.config.ts`.

## Current config shape

```ts
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      target: 'react',
      autoCodeSplitting: true
    }),
    react(),
    tailwindcss(),
    mocksPlugin(resolve(import.meta.dirname, '../../docs/mocks'))
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src')
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:11575'
    }
  }
})
```

## Plugin order

Keep the plugin order intentional:

1. `TanStackRouterVite(...)`
2. `react()`
3. `tailwindcss()`
4. `mocksPlugin(...)`

Guidelines:

- Keep the TanStack Router plugin early so route generation and code splitting stay aligned with the route tree.
- Keep the local `mocksPlugin` after the core framework plugins unless you have a concrete reason to intercept earlier.
- When adding a new plugin, check whether it transforms source, HTML, or dev server behavior before deciding placement.

## Aliases

The repo uses `@` for `packages/client/src`.

Use:

```ts
import { HlsPlayer } from '@/components/player/HlsPlayer'
```

Avoid adding multiple overlapping aliases unless there is a strong boundary reason. One stable app-root alias keeps imports readable.

## Dev server behavior

Current expectations:

- host: `true`
- port: `5173`
- `/api` proxy: `http://localhost:11575`

Implications:

- Frontend code should usually call relative `/api/...` URLs in development.
- If backend port or host changes, update the Vite proxy instead of sprinkling absolute URLs across the client.
- Keep host binding enabled because this repo is used in containers and remote dev environments.

## Mock integration

This repo has a custom `mocksPlugin` under `packages/client/vite-plugins/mocks` pointing at `docs/mocks`.

Use it when you need design-time or demo-time data without coupling the UI to a live backend.

When changing mock behavior:

- Prefer plugin-level changes over ad-hoc component conditionals.
- Keep mock file paths relative to the existing docs mock directory.
- Make sure mock-only behavior does not leak into production assumptions.

## TanStack Router integration

The route tree is generated to `packages/client/src/routeTree.gen.ts`.

Rules:

- Do not hand-edit `routeTree.gen.ts`.
- If routes stop matching the file tree, check the Vite plugin configuration first.
- Keep `routesDirectory` and `generatedRouteTree` aligned with the actual client structure.

## Safe changes

Reasonable Vite edits in this repo:

- add a narrowly scoped plugin
- adjust dev proxy targets
- add a build alias
- tune route generation settings for TanStack Router

Higher-risk edits:

- changing plugin order without understanding transform timing
- changing the route generation output path
- introducing environment-specific absolute URLs in client fetch code
- disabling `host: true` in container-based development

## Pitfalls

- Do not import Node-only modules into browser runtime code just because Vite config can use them.
- Do not replace relative `/api` fetches with hard-coded localhost URLs.
- Do not commit manual edits to generated route files.
- Do not assume a plugin is build-only; many also affect dev server behavior.
