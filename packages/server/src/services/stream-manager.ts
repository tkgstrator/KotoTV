import { mkdir, rm } from 'node:fs/promises'
import { env } from '../lib/config'
import { buildDummyLiveArgs, buildFfmpegArgs, type HwAccel, type LiveCodec, type LiveQuality } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { getDummyVideoPath } from './dummy-source'
import { mirakcClient } from './mirakc-client'
import { startTranscoder, type TranscoderHandle, waitForPlaylist } from './transcoder'

const IDLE_KILL_MS = 15_000
const HW_ACCEL: HwAccel = (process.env.HW_ACCEL_TYPE as HwAccel) ?? 'none'

// Resolve quality preset → target video bitrate in kbps. The dummy lavfi
// path has its own internal mapping (quality → both resolution + bitrate),
// but the Mirakc path decodes an upstream TS that's already at broadcast
// resolution — we only control the re-encode bitrate.
const QUALITY_BITRATE_KBPS: Record<LiveQuality, number> = {
  auto: 2500,
  high: 4500,
  medium: 2500,
  low: 900
}

export interface LiveSessionRequest {
  channelId: string
  quality: LiveQuality
  codec: LiveCodec
}

/** Union type — real sessions wrap either a plain ffmpeg subprocess (dummy
 *  path) or a transcoder handle (Mirakc pipe path). The shape divergence
 *  means stop/cleanup has to branch, but sharing the Map keeps the rest of
 *  the session bookkeeping (viewerCount, idleTimer) identical. */
interface LiveSessionBase {
  sessionId: string
  key: string
  outputDir: string
  viewerCount: number
  idleTimer: ReturnType<typeof setTimeout> | null
}
type LiveSession =
  | (LiveSessionBase & { kind: 'dummy'; proc: Bun.Subprocess })
  | (LiveSessionBase & { kind: 'mirakc'; handle: TranscoderHandle })

type AcquireResult = { sessionId: string; playlistUrl: string }

const sessions = new Map<string, LiveSession>()
// Concurrent acquireLive calls with the same key (StrictMode double-mount,
// two tabs, etc.) hit the Map miss path before the first call has inserted
// its session — they all spawn ffmpeg and we end up with 2-3 orphans. Keep
// an in-flight promise map so concurrent calls await the same spawn.
const inFlight = new Map<string, Promise<AcquireResult>>()

function sessionKey(req: LiveSessionRequest): string {
  return `live:${req.channelId}:${req.quality}:${req.codec}`
}

function playlistUrl(sessionId: string): string {
  return `/api/streams/${sessionId}/playlist.m3u8`
}

/**
 * Get or create a live HLS session. Subsequent callers with the same
 * (channelId, quality, codec) share the existing session and bump
 * viewerCount so one FFmpeg process serves N clients.
 *
 * Source selection:
 * - Try `mirakcClient.openLiveStream(channelId)` first. If that returns a
 *   stream, spawn a Mirakc-piped FFmpeg via `startTranscoder`.
 * - Fall back to the dummy lavfi / Elephants Dream path when Mirakc is
 *   offline (DNS fail, 503, etc.). Same playlist URL either way — the
 *   client can't tell them apart.
 */
export async function acquireLive(req: LiveSessionRequest): Promise<AcquireResult> {
  const key = sessionKey(req)

  const existing = sessions.get(key)
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer)
      existing.idleTimer = null
    }
    existing.viewerCount += 1
    return { sessionId: existing.sessionId, playlistUrl: playlistUrl(existing.sessionId) }
  }

  const pending = inFlight.get(key)
  if (pending) {
    const result = await pending
    const session = sessions.get(key)
    if (session) session.viewerCount += 1
    return result
  }

  const spawn = (async (): Promise<AcquireResult> => {
    const sessionId = crypto.randomUUID()
    const outputDir = `${env.HLS_DIR}/${sessionId}`
    await mkdir(outputDir, { recursive: true })

    // Try Mirakc first. openLiveStream resolves once the headers come back
    // so a quick failure (404, network error) returns here fast — no need
    // for an explicit timeout wrapper.
    const mirakcAbort = new AbortController()
    let mirakcSource: ReadableStream<Uint8Array> | null = null
    try {
      mirakcSource = await mirakcClient.openLiveStream(req.channelId, mirakcAbort.signal)
    } catch (err) {
      logger.info(
        { module: 'stream-manager', sessionId, key, err: err instanceof Error ? err.message : String(err) },
        'Mirakc openLiveStream failed, falling back to dummy source'
      )
    }

    if (mirakcSource) {
      // Mirakc pipe path — push the TS into buildFfmpegArgs's pipe:0 input.
      try {
        const handle = await startTranscoder({
          sessionId,
          source: mirakcSource,
          abortController: mirakcAbort,
          hwAccel: HW_ACCEL,
          videoBitrate: QUALITY_BITRATE_KBPS[req.quality],
          segmentSeconds: 4,
          listSize: 6
        })

        const session: LiveSession = {
          kind: 'mirakc',
          sessionId,
          key,
          outputDir: handle.outputDir,
          handle,
          viewerCount: 1,
          idleTimer: null
        }
        sessions.set(key, session)
        logger.info(
          { module: 'stream-manager', sessionId, key, source: 'mirakc', quality: req.quality, codec: req.codec },
          'session started'
        )

        handle.exited.then(() => {
          if (sessions.get(key) === session) {
            sessions.delete(key)
            logger.info({ module: 'stream-manager', sessionId, key }, 'mirakc transcoder exited, session removed')
          }
        })

        return { sessionId, playlistUrl: playlistUrl(sessionId) }
      } catch (err) {
        // Mirakc gave us a stream but the transcoder couldn't turn it into
        // HLS. Abort upstream + fall through to the dummy path so the user
        // still gets video (likely a format the re-encoder rejects).
        logger.warn(
          { module: 'stream-manager', sessionId, key, err: err instanceof Error ? err.message : String(err) },
          'Mirakc transcoder startup failed, falling back to dummy source'
        )
        mirakcAbort.abort()
      }
    }

    // Dummy path — lavfi testsrc + sine or a looped Elephants Dream clip.
    const sampleFile = await getDummyVideoPath()
    const args = buildDummyLiveArgs({
      outputDir,
      quality: req.quality,
      codec: req.codec,
      ...(sampleFile ? { inputFile: sampleFile } : {})
    })
    // buildFfmpegArgs (Mirakc path) is exported so it stays tree-shakable even
    // when the dummy path is the only one that runs in dev.
    void buildFfmpegArgs // keep reachable for callers wiring future recording paths
    const proc = Bun.spawn(['ffmpeg', ...args], { stdout: 'pipe', stderr: 'pipe' })

    // Drain stderr so the pipe doesn't block. Log at debug so we can tail issues
    // without flooding logs in production.
    ;(async () => {
      const decoder = new TextDecoder()
      const reader = proc.stderr.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const line = decoder.decode(value, { stream: true }).trim()
        if (line) logger.debug({ module: 'stream-manager', sessionId, key }, line)
      }
    })()

    try {
      await waitForPlaylist(`${outputDir}/playlist.m3u8`, 15_000)
    } catch (err) {
      proc.kill()
      await proc.exited.catch(() => 0)
      await rm(outputDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }

    const session: LiveSession = {
      kind: 'dummy',
      sessionId,
      key,
      outputDir,
      proc,
      viewerCount: 1,
      idleTimer: null
    }
    sessions.set(key, session)
    logger.info(
      { module: 'stream-manager', sessionId, key, source: 'dummy', quality: req.quality, codec: req.codec },
      'session started'
    )

    // Self-heal if FFmpeg dies — drop the registry entry so the next
    // acquire rebuilds.
    proc.exited.then(() => {
      if (sessions.get(key) === session) {
        sessions.delete(key)
        rm(outputDir, { recursive: true, force: true }).catch(() => {})
        logger.info({ module: 'stream-manager', sessionId, key }, 'ffmpeg exited, session removed')
      }
    })

    return { sessionId, playlistUrl: playlistUrl(sessionId) }
  })()

  inFlight.set(key, spawn)
  try {
    return await spawn
  } finally {
    inFlight.delete(key)
  }
}

async function stopSession(session: LiveSession): Promise<void> {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  if (session.kind === 'mirakc') {
    await session.handle.abort().catch(() => {})
  } else {
    try {
      session.proc.kill()
      await session.proc.exited.catch(() => 0)
    } catch {
      // already dead
    }
    await rm(session.outputDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Drop the caller's share of a session. When viewerCount hits 0 we arm an
 *  idle timer; if nobody reacquires within IDLE_KILL_MS we tear FFmpeg down
 *  and remove the session dir. */
export function release(sessionId: string): void {
  const session = [...sessions.values()].find((s) => s.sessionId === sessionId)
  if (!session) return

  session.viewerCount = Math.max(0, session.viewerCount - 1)
  if (session.viewerCount > 0) return

  session.idleTimer = setTimeout(async () => {
    if (session.viewerCount > 0) return
    sessions.delete(session.key)
    await stopSession(session)
    logger.info({ module: 'stream-manager', sessionId: session.sessionId, key: session.key }, 'idle session stopped')
  }, IDLE_KILL_MS)
}

/** Stop every session. Called from the SIGTERM handler. */
export async function stopAllSessions(): Promise<void> {
  const current = [...sessions.values()]
  sessions.clear()
  inFlight.clear()
  await Promise.all(current.map((s) => stopSession(s)))
}

/** Resolve a sessionId → filesystem outputDir for serving playlist/segments. */
export function getSessionDir(sessionId: string): string | null {
  const session = [...sessions.values()].find((s) => s.sessionId === sessionId)
  return session?.outputDir ?? null
}
