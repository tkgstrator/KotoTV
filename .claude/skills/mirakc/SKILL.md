---
name: mirakc
description: Mirakc REST client patterns — channel/program listings, live TS stream endpoint, EPG payload shape. Load when editing `packages/server/src/services/mirakc-client.ts` or anything that consumes Mirakc.
---

# Mirakc REST client

Mirakc (OSS reimplementation of Mirakurun) is the upstream tuner daemon. The app talks to it over HTTP; DB (Postgres) caches channels/programs locally.

## Retrieval sources

| Source | URL |
|--------|-----|
| Mirakc | https://github.com/mirakc/mirakc |
| REST endpoints | `MIRAKC_URL` → `/api` — see the `openapi.json` served by Mirakc itself at `/api/docs/openapi.json` |

Always prefer fetching the live `openapi.json` over guessing — Mirakc's routes match Mirakurun's but have diverged in places.

## Endpoints we use

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/services` | channel list (returns all tuners across `GR/BS/CS`) |
| `GET` | `/api/programs?serviceId=<id>` | EPG programs for a service |
| `GET` | `/api/services/{id}/stream?decode=1` | **live MPEG-TS** (this is the big one — body is a chunked stream) |
| `GET` | `/api/version` | health / sanity |

Mirakc does not provide a recording API — we spin our own via FFmpeg (Phase 4).

## Client (`src/services/mirakc-client.ts`)

Thin wrapper. Don't replicate Mirakc types — generate or hand-shape a minimum set.

```ts
import { config } from '../lib/config'

type MirakcService = {
  id: number
  serviceId: number
  networkId: number
  type: number          // 0x01=TV, 0x02=Audio, ...
  name: string
  channel?: { type: 'GR'|'BS'|'CS'|'SKY', channel: string }
}

type MirakcProgram = {
  id: number
  serviceId: number
  networkId: number
  startAt: number       // unix ms
  duration: number      // ms
  name?: string
  description?: string
  genres?: { lv1: number, lv2: number }[]
}

class MirakcError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const mirakcClient = {
  listServices: async (): Promise<MirakcService[]> => {
    const res = await fetch(`${config.MIRAKC_URL}/api/services`)
    if (!res.ok) throw new MirakcError(res.status, 'mirakc services failed')
    return res.json()
  },

  listPrograms: async (serviceId: number): Promise<MirakcProgram[]> => {
    const res = await fetch(`${config.MIRAKC_URL}/api/programs?serviceId=${serviceId}`)
    if (!res.ok) throw new MirakcError(res.status, 'mirakc programs failed')
    return res.json()
  },

  openLiveStream: async (serviceId: number, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch(`${config.MIRAKC_URL}/api/services/${serviceId}/stream?decode=1`, {
      signal,
    })
    if (!res.ok || !res.body) throw new MirakcError(res.status, 'mirakc stream failed')
    return res.body
  },
}
```

**Why `decode=1`**: Mirakc returns descrambled TS. Without it, FFmpeg receives scrambled packets.

## Mapping Mirakc → our DB

| Mirakc field | DB column |
|--------------|-----------|
| `service.id` (globally unique int) | `channels.id` (stringified) |
| `service.serviceId` | `channels.service_id` |
| `service.networkId` | `channels.network_id` |
| `service.channel.type` | `channels.type` (`'GR'/'BS'/'CS'`) |
| `service.name` | `channels.name` |
| `program.id` | `programs.id` (stringified) |
| `program.startAt` (ms) | `programs.start_at` (Date) |
| `program.startAt + duration` | `programs.end_at` |
| `program.name` | `programs.title` |

Filter services: only `type === 0x01` (TV). Skip audio / data carousel services.

## EPG refresh strategy (Phase 3+)

- Fetch `/api/services` every startup → upsert `channels`.
- For each channel, fetch `/api/programs?serviceId=...` every ~30 min (Mirakc caches internally; polling is cheap).
- Write through Prisma with `prisma.program.upsert({ where: { id }, create, update })`.

Don't stream Mirakc's `/events` SSE endpoint in Phase 3 — polling is simpler and works. Revisit if EPG lag bites.

## Streaming (Phase 2, handled in `streaming` agent)

The `streaming` agent calls `mirakcClient.openLiveStream()` and pipes the returned `ReadableStream` into `Bun.spawn` FFmpeg. See `.claude/skills/ffmpeg-hls/SKILL.md`. On client-side abort, pass `signal` so Mirakc stops producing.

## Dev config (`config/mirakc/config.yml`)

Checked into repo (sample). Real tuner channels depend on your region:

```yaml
server:
  addrs:
    - http: '0.0.0.0:40772'
channels:
  - name: NHK-G
    type: GR
    channel: '27'
  # ...
```

DVB device passthrough is configured in `compose.yaml` (`devices: [/dev/dvb]`).

## Pitfalls

- Calling `openLiveStream` without consuming the body → Mirakc keeps producing (tuner stays busy). Always consume or abort.
- Fetching `/api/services` without filtering `type === 0x01` → audio services show up as empty channels.
- Mirakc's timestamps are **milliseconds**, not seconds. Wrap with `new Date(ms)` before Prisma.
- `serviceId` (Mirakc-local) and `service.id` (Mirakurun-format global) are different. Use `service.id` for persistence.
