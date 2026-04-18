---
name: bun-hono
description: Hono + Bun.serve + Hono RPC patterns for this project's server package. Load when editing `packages/server/src/{index,app,routes}/*`, wiring new routes, or sharing types with the client via `hc<AppType>`.
---

# Hono on Bun — conventions for `packages/server`

The server is a single Bun process running a Hono app. The same `AppType` is exported for the client to consume through `@hono/client`.

## Retrieval sources

| Source | URL | Use for |
|--------|-----|---------|
| Hono docs | https://hono.dev | route builders, middleware |
| Hono RPC | https://hono.dev/docs/guides/rpc | `hc<AppType>` client usage |
| Hono streaming | https://hono.dev/docs/helpers/streaming | `stream` / `streamText` / `streamSSE` |
| Bun.serve | https://bun.sh/docs/api/http | fetch handler, `error`, `development` |
| zValidator | https://hono.dev/docs/guides/validation | request validation |

## Entry (`src/index.ts`)

```ts
import { serve } from 'bun'
import { app } from './app'
import { config } from './lib/config'
import { logger } from './lib/logger'

const server = Bun.serve({
  fetch: app.fetch,
  port: config.PORT,
  development: config.NODE_ENV !== 'production',
  error: (err) => {
    logger.error({ err }, 'unhandled')
    return new Response('Internal Server Error', { status: 500 })
  },
})

logger.info({ port: server.port }, 'listening')

// graceful shutdown for streaming sessions
process.on('SIGTERM', async () => {
  await server.stop()
  process.exit(0)
})
```

## App + routes (`src/app.ts`)

Chain route builders so `AppType` stays inferred. **Do not break the chain** — it's the only way the RPC client gets accurate types.

```ts
import { Hono } from 'hono'
import { logger as reqLogger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { HTTPException } from 'hono/http-exception'
import { channelsRoute } from './routes/channels'
import { programsRoute } from './routes/programs'
import { streamsRoute } from './routes/streams'
import { recordingsRoute } from './routes/recordings'
import { statusRoute } from './routes/status'

const root = new Hono()
  .use('*', requestId())
  .use('*', reqLogger())
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: { code: err.status, message: err.message } }, err.status)
    }
    return c.json({ error: { code: 500, message: 'internal' } }, 500)
  })
  .route('/api/status', statusRoute)
  .route('/api/channels', channelsRoute)
  .route('/api/programs', programsRoute)
  .route('/api/streams', streamsRoute)
  .route('/api/recordings', recordingsRoute)

export const app = root
export type AppType = typeof root
```

## Route module (`src/routes/channels.ts`)

```ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ChannelListQuerySchema, ChannelListResponseSchema } from '../schemas/Channel.dto'
import { mirakcClient } from '../services/mirakc-client'

export const channelsRoute = new Hono()
  .get('/', zValidator('query', ChannelListQuerySchema), async (c) => {
    const { type } = c.req.valid('query')
    const channels = await mirakcClient.listChannels({ type })
    const body = ChannelListResponseSchema.parse({ channels })
    return c.json(body)
  })
```

## Zod DTO (`src/schemas/Channel.dto.ts`)

```ts
import { z } from 'zod'

export const ChannelTypeSchema = z.enum(['GR', 'BS', 'CS'])
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ChannelTypeSchema,
  serviceId: z.number().int(),
})
export const ChannelListQuerySchema = z.object({
  type: ChannelTypeSchema.optional(),
})
export const ChannelListResponseSchema = z.object({
  channels: z.array(ChannelSchema),
})

export type Channel = z.infer<typeof ChannelSchema>
```

## Serving the SPA (prod)

Mount the client's static build via `serveStatic`:

```ts
import { serveStatic } from 'hono/bun'

root
  .use('/assets/*', serveStatic({ root: '../client/dist' }))
  .get('*', serveStatic({ path: '../client/dist/index.html' }))  // SPA fallback
```

In dev the client runs on its own Vite port (`5173`); CORS or Vite proxy is set up by the `frontend` agent.

## Hono RPC on the client

```ts
// packages/client/src/api/client.ts
import { hc } from 'hono/client'
import type { AppType } from '../../../server/src/app'   // type-only import

export const api = hc<AppType>('/')
```

Usage:

```ts
const res = await api.api.channels.$get({ query: { type: 'BS' } })
const { channels } = await res.json()     // fully typed
```

## Streaming responses (handled by `streaming` agent)

Use `stream` / `streamText` / raw `c.body(readableStream)`. HLS playlist/segment delivery should use `Bun.file().stream()` — it zero-copies from disk when possible.

## Config (`src/lib/config.ts`)

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(11575),
  DATABASE_URL: z.string().url(),
  MIRAKC_URL: z.string().url(),
  HW_ACCEL_TYPE: z.enum(['nvenc', 'qsv', 'vaapi', 'none']).default('none'),
  HLS_DIR: z.string().default('/app/data/hls'),
})

export const config = EnvSchema.parse(Bun.env)
```

## Pitfalls

- Breaking the route chain (assigning `root = root.route(...)` vs just chaining) drops `AppType` inference. Chain in one expression and export at the end.
- Calling `c.json(obj)` without `satisfies` / `parse` leaks un-validated fields to the client. Parse response with Zod before returning.
- `zValidator('json', ...)` on a `GET` is a type error — use `'query'` for GETs.
- `serveStatic` mounts must be ordered **after** API routes and **before** the SPA fallback.
