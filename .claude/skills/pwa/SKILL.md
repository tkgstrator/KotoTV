---
name: pwa
description: PWA implementation — Service Worker registration, cache strategies, update notification flow, and manifest setup. Load when adding PWA support, Service Worker caching, update prompts, offline fallback, or cache-invalidation logic to any web app.
---

# PWA: Service Worker, Caching & Update Flow

A complete, library-free PWA pattern covering Service Worker caching, app update detection, user-facing update UI, and manifest configuration. Framework-agnostic core with React examples.

## When to use this skill

- Adding PWA / offline support to a web app
- Writing or modifying a Service Worker
- Implementing "update available" notifications
- Debugging stale cache issues
- Setting up `manifest.json` and install experience

## Why hand-written SW over vite-plugin-pwa / Workbox?

Both are fine tools but they:
- Generate opaque runtime code you can't easily debug.
- Couple cache strategy to build config rather than keeping it in one readable file.
- Overfit to SPA shells and make custom update UX awkward.

For apps with simple caching needs (static assets cache-first, HTML network-first, API never cached), a hand-written ~50-line SW is clearer and more maintainable.

---

## 1. Cache Strategy Rules

| Resource type | Strategy | Rationale |
|---------------|----------|-----------|
| `/api/*` | **Network only** (no cache) | Prevents stale data bugs |
| HTML / navigation | **Network-first**, offline fallback to cached `/` | Users always get freshest entry point |
| Static assets (`.js`, `.css`, images, fonts) | **Cache-first**, then network | Content-hashed filenames make cached copies safe forever |
| Everything else | **Pass-through** (no `respondWith`) | Let the browser handle it normally |

---

## 2. Service Worker (`public/sw.js`)

```js
const CACHE_NAME = 'myapp-v1'
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API — never cache
  if (url.pathname.startsWith('/api/')) return

  // Navigation — network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  // Static assets — cache-first
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }
})
```

### Key design decisions

- **`skipWaiting()` + `clients.claim()`**: Without them, a new SW sits in "waiting" state until every tab closes. This pair activates immediately on next page load.
- **Bump `CACHE_NAME`** (`v1` → `v2`) only when you change cache strategy or need to force-evict everything. The `activate` handler auto-deletes other caches. Normal deploys don't need a bump because content-hashed filenames handle cache busting.

---

## 3. SW Registration

Register inline in `<head>`, not inside a framework lifecycle hook:

```html
<script>
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
</script>
```

**Why inline?**
- Runs before framework mounts — catches the first render.
- No import waterfall.
- Safely guarded by feature check.

React/JSX variant:
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')`
  }}
/>
```

---

## 4. Build-time Version Stamp

Inject a unique version constant at build time:

```ts
// vite.config.ts (or equivalent bundler config)
const buildVersion = Date.now().toString(36)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion)
  }
})
```

Declare for TypeScript:
```ts
declare const __APP_VERSION__: string
```

Base-36 timestamp: monotonic, short, URL-safe, no git dependency. Alternative: `execSync('git rev-parse --short HEAD').toString().trim()`.

---

## 5. Version API Endpoint

```ts
// Example: /api/version route handler
declare const __APP_VERSION__: string

export function GET() {
  return Response.json({ version: __APP_VERSION__ })
}
```

**How detection works**: The client's bundled JS has version X baked in. After redeploy, `/api/version` returns Y while the client still has X → mismatch → show banner.

---

## 6. Version Check Hook (React)

```ts
import { useEffect, useState } from 'react'

declare const __APP_VERSION__: string
const VERSION_KEY = 'app_version'
type UpdateState = 'idle' | 'preparing' | 'ready'

export function useVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [state, setState] = useState<UpdateState>('idle')

  useEffect(() => {
    if (import.meta.env.DEV) return

    const check = async () => {
      try {
        const res = await fetch('/api/version')
        if (!res.ok) return
        const { version } = (await res.json()) as { version: string }
        const stored = localStorage.getItem(VERSION_KEY)
        if (!stored) {
          localStorage.setItem(VERSION_KEY, version)
          return
        }
        if (stored !== version) setHasUpdate(true)
      } catch {
        // Offline or API down — fail silently
      }
    }
    check()
  }, [])

  const prepare = async () => {
    setState('preparing')
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) await reg.update()
    }
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    localStorage.removeItem(VERSION_KEY)
    await new Promise((r) => setTimeout(r, 2000))
    setState('ready')
  }

  const reload = () => window.location.reload()

  return { hasUpdate, state, prepare, reload }
}
```

### Design choices

- **Seed `localStorage` on first visit, don't set `hasUpdate`**: First-load users have no baseline — skip banner until the second visit after an update.
- **Two-step flow**: `prepare()` wipes caches + shows progress; `reload()` is a separate user action. Never auto-reload — users lose in-progress input.
- **`import.meta.env.DEV` guard**: Dev server has HMR, no need for update banners.
- **Silent failure**: If `/api/version` is unreachable, don't show stale or error UI.

### Non-React adaptation

The core logic is just:
1. `fetch('/api/version')` → compare with `localStorage`
2. On mismatch: `sw.update()` → `caches.delete()` → `localStorage.removeItem` → `location.reload()`

Wrap in any framework's lifecycle (Vue `onMounted`, Svelte `onMount`, vanilla `DOMContentLoaded`).

---

## 7. Update Banner UI Pattern

Two distinct states:

1. **Inline banner** (non-blocking): Shows "Update available — tap to install". Lives in page flow, not a fixed toast.
2. **Full-screen overlay** (opt-in): Only after user taps. Shows progress animation → "Reload" button.

```
User sees banner → taps "Update" → prepare() runs →
  cache wipe + SW update → progress animation →
  "Reload" button appears → user taps → page reloads with new version
```

**Never auto-reload.** Always require explicit user action for the final reload.

---

## 8. Web App Manifest (`public/manifest.json`)

```json
{
  "name": "My App",
  "short_name": "MyApp",
  "description": "App description",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#22c55e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Link from `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#22c55e" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### iOS requirements

iOS Safari requires **all four** of `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and `theme-color` meta. Missing any one degrades the installed experience.

---

## 9. Theme Initialization (avoid flash)

Run inline before paint to prevent dark mode flash:

```html
<script>
  (function(){
    try {
      var t = localStorage.getItem('theme');
      if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme:dark)').matches))
        document.documentElement.classList.add('dark');
    } catch(e) {}
  })()
</script>
```

Keep it tiny, IIFE-wrapped, with `try/catch` for blocked `localStorage`.

---

## Anti-patterns

| Don't | Why |
|-------|-----|
| Cache API responses in the SW | Stale data bugs that are hard to reproduce |
| Auto-reload on update detection | Users lose in-progress form input |
| Poll `/api/version` every N seconds | Mount-only check is sufficient; users remount via navigation |
| Register SW inside `useEffect` / `onMounted` | Delays activation by one hydration cycle, races with first navigation |
| Use module SW (`type: 'module'`) without reason | Browser support and caching semantics are trickier |
| Hard-code version string in source | Use build-time `define` so every build gets a unique ID |
| Use `importScripts()` for precache manifests | Adds complexity; inline static extension regex is simpler |

---

## Debugging Checklist

1. **Update not detected?** Check that `__APP_VERSION__` in the bundle differs from `/api/version` response. Verify `localStorage` has the old version stored.
2. **Old assets still served?** Open DevTools → Application → Cache Storage. Verify old caches were deleted. Check that asset filenames have content hashes.
3. **SW not activating?** Check `skipWaiting()` is called in `install`. Check `clients.claim()` in `activate`. Look for errors in DevTools → Application → Service Workers.
4. **iOS install broken?** Verify all four meta tags are present. Test in Safari (not Chrome on iOS — Chrome delegates to Safari's SW implementation but has quirks).
5. **Offline fallback not working?** Ensure `/` was cached at least once (first visit must be online). Check `navigate` handler falls back to `caches.match('/')`.
