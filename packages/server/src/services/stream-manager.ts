import { mkdir, rm } from 'node:fs/promises'
import type { Subprocess } from 'bun'
import { env } from '../lib/config'
import { buildDummyLiveArgs, type LiveCodec, type LiveQuality } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { getDummyVideoPath } from './dummy-source'
import { waitForPlaylist } from './transcoder'

const IDLE_KILL_MS = 15_000

export interface LiveSessionRequest {
  channelId: string
  quality: LiveQuality
  codec: LiveCodec
}

interface LiveSession {
  sessionId: string
  key: string
  outputDir: string
  proc: Subprocess
  viewerCount: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

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

/**
 * Get or create a live HLS session. Subsequent callers with the same
 * (channelId, quality, codec) share the existing session and bump
 * viewerCount so one FFmpeg process serves N clients.
 *
 * For now the source is a lavfi dummy so the whole pipe is exercisable
 * without Mirakc. Swap the spawn source to a real Mirakc stream once
 * that integration lands — the session bookkeeping stays the same.
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
    return { sessionId: existing.sessionId, playlistUrl: `/api/streams/${existing.sessionId}/playlist.m3u8` }
  }

  const pending = inFlight.get(key)
  if (pending) {
    // Attach to a spawn that's mid-flight. Bump viewerCount after it resolves.
    const result = await pending
    const session = sessions.get(key)
    if (session) {
      session.viewerCount += 1
    }
    return result
  }

  const spawn = (async (): Promise<AcquireResult> => {
    const sessionId = crypto.randomUUID()
    const outputDir = `${env.HLS_DIR}/${sessionId}`
    await mkdir(outputDir, { recursive: true })

    // Prefer a cached public-domain sample as the source when available;
    // fall back to lavfi testsrc when the download hasn't completed yet or
    // we're offline. Either way the client sees a real HLS playlist.
    const sampleFile = await getDummyVideoPath()
    const args = buildDummyLiveArgs({
      outputDir,
      quality: req.quality,
      codec: req.codec,
      ...(sampleFile ? { inputFile: sampleFile } : {})
    })
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

    const session: LiveSession = { sessionId, key, outputDir, proc, viewerCount: 1, idleTimer: null }
    sessions.set(key, session)
    logger.info({ module: 'stream-manager', sessionId, key, quality: req.quality, codec: req.codec }, 'session started')

    // Self-heal if FFmpeg dies — drop the registry entry so the next
    // acquire rebuilds.
    proc.exited.then(() => {
      if (sessions.get(key) === session) {
        sessions.delete(key)
        rm(outputDir, { recursive: true, force: true }).catch(() => {})
        logger.info({ module: 'stream-manager', sessionId, key }, 'ffmpeg exited, session removed')
      }
    })

    return { sessionId, playlistUrl: `/api/streams/${sessionId}/playlist.m3u8` }
  })()

  inFlight.set(key, spawn)
  try {
    return await spawn
  } finally {
    inFlight.delete(key)
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
    try {
      session.proc.kill()
      await session.proc.exited.catch(() => 0)
    } catch {
      // already exited
    }
    await rm(session.outputDir, { recursive: true, force: true }).catch(() => {})
    logger.info({ module: 'stream-manager', sessionId: session.sessionId, key: session.key }, 'idle session stopped')
  }, IDLE_KILL_MS)
}

/** Stop every session. Called from the SIGTERM handler. */
export async function stopAllSessions(): Promise<void> {
  const current = [...sessions.values()]
  sessions.clear()
  inFlight.clear()
  await Promise.all(
    current.map(async (session) => {
      if (session.idleTimer) clearTimeout(session.idleTimer)
      try {
        session.proc.kill()
        await session.proc.exited.catch(() => 0)
      } catch {
        // already dead
      }
      await rm(session.outputDir, { recursive: true, force: true }).catch(() => {})
    })
  )
}

/** Resolve a sessionId → filesystem outputDir for serving playlist/segments. */
export function getSessionDir(sessionId: string): string | null {
  const session = [...sessions.values()].find((s) => s.sessionId === sessionId)
  return session?.outputDir ?? null
}
