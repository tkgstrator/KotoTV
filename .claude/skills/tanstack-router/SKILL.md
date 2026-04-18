---
name: tanstack-router
description: TanStack Router conventions for the Vite + React SPA in `packages/client`. File-based routing, typed params, loaders integrated with TanStack Query. Load when adding routes or wiring up the router.
---

# TanStack Router — file-based SPA routing

This project uses **TanStack Router** (not react-router). Routes are generated from files under `src/routes/` via the Vite plugin `@tanstack/router-plugin`. `routeTree.gen.ts` is committed and regenerated on dev/build.

## Setup (Phase 0)

```sh
cd packages/client
bun add @tanstack/react-router
bun add -D @tanstack/router-plugin @tanstack/router-devtools
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:11575' },
  },
})
```

`src/main.tsx`:

```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { ThemeProvider } from 'next-themes'
import './main.css'

const queryClient = new QueryClient()
const router = createRouter({ routeTree, context: { queryClient } })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute='class' defaultTheme='system'>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

## File layout → URL

| File | URL |
|------|-----|
| `src/routes/__root.tsx` | shell / layout root (Outlet + providers' children) |
| `src/routes/index.tsx` | `/` |
| `src/routes/epg.tsx` | `/epg` |
| `src/routes/live/$channelId.tsx` | `/live/:channelId` |
| `src/routes/recordings/index.tsx` | `/recordings` |
| `src/routes/recordings/$id.tsx` | `/recordings/:id` |
| `src/routes/_authed/admin.tsx` | `/admin` inside a pathless `_authed` layout |

## Route file skeleton

```tsx
// src/routes/live/$channelId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useLiveStream } from '@/hooks/useLiveStream'
import { HlsPlayer } from '@/components/player/HlsPlayer'

export const Route = createFileRoute('/live/$channelId')({
  // optional prefetch — pair with TanStack Query:
  loader: async ({ context: { queryClient }, params: { channelId } }) => {
    await queryClient.ensureQueryData({
      queryKey: ['channel', channelId],
      queryFn: () => fetchChannel(channelId),
    })
  },
  component: LivePage,
})

function LivePage() {
  const { channelId } = Route.useParams()           // typed
  const { playlistUrl } = useLiveStream(channelId)
  return playlistUrl ? <HlsPlayer src={playlistUrl} /> : null
}
```

## `__root.tsx` conventions

```tsx
// src/routes/__root.tsx
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
```

Dev tools are opt-in:

```tsx
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
...
{import.meta.env.DEV && <TanStackRouterDevtools />}
```

## Search params

Validate with Zod — the router uses the schema for type inference and coercion.

```tsx
export const Route = createFileRoute('/epg')({
  validateSearch: z.object({
    at: z.string().datetime().optional(),
    channel: z.string().optional(),
  }),
  component: EPGPage,
})

function EPGPage() {
  const { at, channel } = Route.useSearch()
  ...
}
```

## Navigation

- `<Link to="/live/$channelId" params={{ channelId }} />` — typed, required `params` for dynamic segments.
- Programmatic: `const navigate = useNavigate(); navigate({ to: '/epg', search: { at } })`.
- Avoid string concatenation for URLs — the router knows the typed URL shape.

## Not found / pending / error

- Route-level `pendingComponent`, `errorComponent`, `notFoundComponent`.
- Global fallback: define on `createRouter({ defaultPendingComponent, defaultErrorComponent, defaultNotFoundComponent })`.

## Integration with TanStack Query

Two patterns, pick based on whether the data blocks first paint:

- **Loader + `ensureQueryData`**: prefetch in the loader so the component renders with data. Use for the page's primary data.
- **`useQuery` in component**: simpler; the component renders with a pending state. Use for secondary data.

```tsx
export const Route = createFileRoute('/epg')({
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery()),
  component: () => {
    const programs = useSuspenseQuery(programsQuery()).data
    ...
  },
})
```

## Route guards (future: `/admin/*` via Cloudflare Access)

The `_authed` pathless layout is currently a no-op — Cloudflare Access gates `/admin/*` at the infrastructure layer (per project memory: admin route auth is handled by Cloudflare Access, not the app). Don't add a React-side auth check for `/admin/*`. Other protected areas can use `beforeLoad` + `redirect()`.

## Pitfalls

- Forgetting to regenerate `routeTree.gen.ts` — the Vite plugin watches, but CI/build needs the plugin in the pipeline.
- Typo in the file path → silent "not found" because the route tree didn't pick it up. Check the devtools.
- Dynamic segment syntax is `$param` (dollar sign), not `[param]` or `:param`.
- Do not hand-edit `routeTree.gen.ts`. Ever.