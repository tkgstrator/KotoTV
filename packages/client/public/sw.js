const CACHE_NAME = 'kototv-v1'
const CHANNEL_CACHE = 'kototv-channels-v1'
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/
const CHANNEL_URL_RE = /^\/api\/channels(\?|$)/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, CHANNEL_CACHE])
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Cloudflare Access / CDN internals — never intercept
  if (url.pathname.startsWith('/cdn-cgi/')) return

  // /api/channels — stale-while-revalidate
  if (CHANNEL_URL_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CHANNEL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          return cached || networkFetch
        })
      )
    )
    return
  }

  // All other API / streaming routes — never cache
  if (url.pathname.startsWith('/api/')) return

  // Navigation — network-first, offline fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  // Static assets (content-hashed by Vite) — cache-first
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }
})
