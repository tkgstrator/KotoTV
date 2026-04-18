---
name: ffmpeg-hls
description: FFmpeg → HLS pipeline patterns for Phase 2 live streaming. Command builder per HW-accel target, `Bun.spawn` process lifecycle, HLS playlist/segment layout. Load when editing `packages/server/src/{lib/ffmpeg.ts,services/{transcoder,stream-manager}.ts}` or streams routes.
---

# FFmpeg → HLS pipeline

The critical-path feature: pipe Mirakc's MPEG-TS stream into FFmpeg, emit HLS (playlist + `.ts` segments) on tmpfs, serve via Hono. Every streaming decision in this project is downstream of what's in this file.

## Retrieval sources

| Source | URL |
|--------|-----|
| FFmpeg hls muxer | https://ffmpeg.org/ffmpeg-formats.html#hls-2 |
| FFmpeg codecs (encoders) | https://ffmpeg.org/ffmpeg-codecs.html |
| NVEnc guide | https://trac.ffmpeg.org/wiki/HWAccelIntro#NVENC |
| QSV / VAAPI guide | https://trac.ffmpeg.org/wiki/Hardware/QuickSync |
| Mirakc REST | https://github.com/mirakc/mirakc — `/api/services/{id}/stream` |
| Bun.spawn | https://bun.sh/docs/api/spawn |

## Pipeline shape (must match)

```
Mirakc /api/services/{id}/stream (MPEG-TS, live)
  └─ fetch().body → ReadableStream
       └─ Bun.spawn('ffmpeg', args, { stdin: 'pipe', stdout: 'ignore', stderr: 'pipe' })
            └─ stdin <- pipe loop
       └─ /app/data/hls/<sessionId>/  (on tmpfs)
            ├─ playlist.m3u8
            └─ seg_00001.ts, seg_00002.ts, ...
                 └─ Hono GET /api/streams/:sessionId/{playlist.m3u8,seg_*.ts}
                      └─ hls.js on the client
```

## Command builder (`packages/server/src/lib/ffmpeg.ts`)

Pure function. No side effects. Dispatches on `HW_ACCEL_TYPE`.

```ts
import type { HWAccel } from './config'

export type FfmpegOpts = {
  outputDir: string       // absolute path under HLS_DIR
  segmentSeconds?: number // default 2
  listSize?: number       // default 6
  videoBitrate?: string   // default '4M'
  audioBitrate?: string   // default '128k'
  hwAccel: HWAccel        // 'nvenc' | 'qsv' | 'vaapi' | 'none'
}

export function buildFfmpegArgs(opts: FfmpegOpts): string[] {
  const {
    outputDir,
    segmentSeconds = 2,
    listSize = 6,
    videoBitrate = '4M',
    audioBitrate = '128k',
    hwAccel,
  } = opts

  const input = ['-hide_banner', '-loglevel', 'warning', '-i', 'pipe:0']
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']
  const audio = ['-c:a', 'aac', '-b:a', audioBitrate]

  const video = (() => {
    switch (hwAccel) {
      case 'nvenc':
        return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-b:v', videoBitrate]
      case 'qsv':
        return ['-c:v', 'h264_qsv', '-preset', 'faster', '-b:v', videoBitrate]
      case 'vaapi':
        return [
          '-vaapi_device', '/dev/dri/renderD128',
          '-vf', 'format=nv12,hwupload',
          '-c:v', 'h264_vaapi', '-b:v', videoBitrate,
        ]
      default:
        return ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', videoBitrate]
    }
  })()

  const hls = [
    '-f', 'hls',
    '-hls_time', String(segmentSeconds),
    '-hls_list_size', String(listSize),
    '-hls_flags', 'delete_segments+append_list+independent_segments',
    '-hls_segment_filename', `${outputDir}/seg_%05d.ts`,
    `${outputDir}/playlist.m3u8`,
  ]

  return [...input, ...mapping, ...video, ...audio, ...hls]
}
```

Never inline these flags in `transcoder.ts`. If tuning is needed, add parameters to `FfmpegOpts` and test.

## Process lifecycle (`services/transcoder.ts`)

```ts
import { mkdir } from 'node:fs/promises'
import { logger } from '../lib/logger'
import { buildFfmpegArgs, type FfmpegOpts } from '../lib/ffmpeg'

export type TranscoderHandle = {
  sessionId: string
  proc: ReturnType<typeof Bun.spawn>
  abort: () => Promise<void>
  waitReady: Promise<void>    // resolves when playlist.m3u8 exists
}

export async function startTranscoder(
  sessionId: string,
  outputDir: string,
  source: ReadableStream<Uint8Array>,
  opts: Omit<FfmpegOpts, 'outputDir'>,
): Promise<TranscoderHandle> {
  await mkdir(outputDir, { recursive: true })

  const proc = Bun.spawn(['ffmpeg', ...buildFfmpegArgs({ ...opts, outputDir })], {
    stdin: 'pipe',
    stdout: 'ignore',
    stderr: 'pipe',
    onExit: (_, exitCode, signal) => {
      logger.info({ sessionId, exitCode, signal }, 'ffmpeg exited')
    },
  })

  // tee stderr → pino (debug)
  ;(async () => {
    const reader = proc.stderr.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      logger.debug({ sessionId, ffmpeg: decoder.decode(value) }, 'ffmpeg stderr')
    }
  })()

  // pump Mirakc → ffmpeg stdin
  const reader = source.getReader()
  const pump = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        await proc.stdin!.write(value)    // awaited → backpressure honored
      }
    } catch (err) {
      logger.warn({ err, sessionId }, 'source pump failed')
    } finally {
      proc.stdin!.end()
    }
  })()

  const waitReady = waitForPlaylist(`${outputDir}/playlist.m3u8`, 10_000)

  const abort = async () => {
    try { await reader.cancel() } catch {}
    try { proc.kill() } catch {}
    await proc.exited
    await pump
  }

  return { sessionId, proc, abort, waitReady }
}
```

`waitForPlaylist(path, timeoutMs)` — poll with `Bun.file(path).exists()` every 200ms. Reject on timeout. This bounds the worst-case "spinner forever" scenario.

## Session manager rules (`services/stream-manager.ts`)

- Key: `(channelId, quality)` → one `TranscoderHandle` + `viewerCount`.
- `acquire(channelId, quality)` → if exists: `viewerCount++`, return existing session. Else: start.
- `release(sessionId)` → `viewerCount--`. If `0`: start `setTimeout(idleKillMs)` (default 15_000). On expiry: `handle.abort()` + `rm -rf outputDir`. On re-acquire before timer fires: cancel timer.
- On `SIGTERM`: iterate all sessions, await `abort()`, exit. Zombie ffmpeg processes have bitten this class of app before — do not skip.

## HLS directory hygiene

- Outputs under `/app/data/hls/<sessionId>/` (env `HLS_DIR`).
- tmpfs via docker-compose (`tmpfs: /app/data/hls:size=512M`) — segments never touch disk.
- `-hls_flags delete_segments` prunes old `.ts` files as the list rotates. Still unlink the session dir on teardown.

## Hono route surface (owned by `streaming` agent)

```ts
// /api/streams/live/:channelId
streams.post('/live/:channelId', zValidator('param', LiveParamSchema), async (c) => {
  const { channelId } = c.req.valid('param')
  const { sessionId, playlistUrl } = await streamManager.acquireLive(channelId)
  return c.json({ sessionId, playlistUrl })
})

// /api/streams/:sessionId/playlist.m3u8
streams.get('/:sessionId/playlist.m3u8', async (c) => {
  const { sessionId } = c.req.param()
  const file = Bun.file(`${config.HLS_DIR}/${sessionId}/playlist.m3u8`)
  if (!(await file.exists())) throw new HTTPException(404)
  c.header('Content-Type', 'application/vnd.apple.mpegurl')
  return c.body(file.stream())
})
```

Segment (`*.ts`) route mirrors the playlist pattern with `video/MP2T`.

## Quality knobs for tuning later

Don't tune until Phase 2 is actually working end-to-end. Then consider:

- `-hls_time 2` vs `4` — shorter = lower latency, more HTTP overhead.
- `-hls_list_size 6` (≈12s buffer) vs `12` — larger = survives hiccups, worse "live edge" latency.
- `-hls_playlist_type event` vs default (live/sliding) — we want the default for live.
- `-g` (GOP size): match `fps × hls_time` for clean segment boundaries.

## Pitfalls

- **Unbounded stderr buffer** → use the reader pattern, don't accumulate the whole output.
- **Forgetting `-hls_flags delete_segments`** → tmpfs fills up, the box OOMs.
- **Starting FFmpeg before `mkdir`** → FFmpeg exits immediately with "could not open file".
- **Not awaiting `proc.stdin.write()`** → lost backpressure, memory spike.
- **Missing `SIGTERM` handler** → zombie ffmpeg. This bites every HLS project that skips it.
- **VAAPI device path**: `/dev/dri/renderD128` exists inside the container only if `devices:` maps it.