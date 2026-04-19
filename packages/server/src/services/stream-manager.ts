// Stream manager: session lifecycle, viewer ref-counting, idle timeout.
// One FFmpeg process per unique (channelId, codec, quality); viewers share the same session.

import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../lib/config'
import { type Codec, type Quality, resolutionFor } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import type { StreamInfo } from '../schemas/Stream.dto'
import { mirakcClient } from './mirakc-client'
import { startTranscoder, type TranscoderHandle } from './transcoder'

// ---------------------------------------------------------------------------
// Session key
// ---------------------------------------------------------------------------

type SessionKey = `${string}|${'avc' | 'hevc'}|${'low' | 'mid' | 'high'}`

function sessionKey(channelId: string, codec: Codec, quality: Quality): SessionKey {
  return `${channelId}|${codec}|${quality}` as SessionKey
}

// ---------------------------------------------------------------------------
// Session type
// ---------------------------------------------------------------------------

type Session = {
  sessionId: string
  channelId: string
  codec: Codec
  quality: Quality
  resolution: string
  outputDir: string
  handle: TranscoderHandle
  viewerCount: number
  /** Timer scheduled to kill the session after all viewers leave. */
  idleTimer: ReturnType<typeof setTimeout> | null
  createdAt: number
}

/** (channelId|codec|quality) → Session */
const byKey = new Map<SessionKey, Session>()
/** sessionId → SessionKey (reverse index for O(1) release / lookup) */
const bySession = new Map<string, SessionKey>()

const managerLogger = logger.child({ module: 'stream-manager' })

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const streamManager = {
  /**
   * Acquire (or join) a live HLS session for the given channel + codec + quality.
   * Returns the sessionId and a relative playlist URL ready for the client.
   */
  async acquireLive(
    channelId: string,
    codec: Codec,
    quality: Quality
  ): Promise<{ sessionId: string; playlistUrl: string }> {
    const key = sessionKey(channelId, codec, quality)
    const existing = byKey.get(key)

    if (existing) {
      // Cancel any pending idle shutdown — a viewer is back.
      if (existing.idleTimer !== null) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = null
        managerLogger.debug(
          { sessionId: existing.sessionId, channelId, codec, quality },
          'idle timer cancelled — viewer rejoined'
        )
      }
      existing.viewerCount++
      managerLogger.debug(
        { sessionId: existing.sessionId, channelId, codec, quality, viewerCount: existing.viewerCount },
        'viewer joined existing session'
      )
      return {
        sessionId: existing.sessionId,
        playlistUrl: `/api/streams/${existing.sessionId}/playlist.m3u8`
      }
    }

    // Create new session
    const sessionId = crypto.randomUUID()
    const outputDir = path.join(env.HLS_DIR, sessionId)
    const resolution = resolutionFor(quality)

    managerLogger.info({ sessionId, channelId, codec, quality, outputDir }, 'starting new live session')

    await mkdir(outputDir, { recursive: true })

    let openResult: Awaited<ReturnType<typeof mirakcClient.openLiveStream>>
    try {
      openResult = await mirakcClient.openLiveStream(channelId)
    } catch (err) {
      await rmDir(outputDir)
      throw err
    }

    const hwAccel = env.HW_ACCEL_TYPE

    let handle: TranscoderHandle
    try {
      handle = startTranscoder({
        sessionId,
        outputDir,
        source: openResult.stream,
        hwAccel,
        codec,
        quality
      })
    } catch (err) {
      await openResult.cancel()
      await rmDir(outputDir)
      throw err
    }

    // Wait until FFmpeg has written at least one playlist before returning to
    // the caller — this prevents the client from hitting 503 on the first request.
    try {
      await handle.waitForPlaylist(15_000)
    } catch (err) {
      managerLogger.error({ sessionId, channelId, codec, quality, err }, 'playlist_timeout — tearing down session')
      await handle.abort()
      await rmDir(outputDir)
      throw err
    }

    const session: Session = {
      sessionId,
      channelId,
      codec,
      quality,
      resolution,
      outputDir,
      handle,
      viewerCount: 1,
      idleTimer: null,
      createdAt: Date.now()
    }

    byKey.set(key, session)
    bySession.set(sessionId, key)

    managerLogger.info({ sessionId, channelId, codec, quality }, 'live session ready')

    // If FFmpeg exits unexpectedly, clean up the maps so the next
    // acquireLive call starts fresh instead of returning a dead session.
    handle.exited.then((code) => {
      managerLogger.warn(
        { sessionId, channelId, codec, quality, code },
        'ffmpeg exited unexpectedly — removing session'
      )
      teardownEntry(sessionId)
    })

    return {
      sessionId,
      playlistUrl: `/api/streams/${sessionId}/playlist.m3u8`
    }
  },

  /**
   * Decrement the viewer count. When it reaches zero, schedule an idle kill.
   * Silently ignores unknown sessionIds.
   */
  release(sessionId: string): void {
    const key = bySession.get(sessionId)
    if (!key) return

    const session = byKey.get(key)
    if (!session) return

    session.viewerCount = Math.max(0, session.viewerCount - 1)

    managerLogger.debug(
      {
        sessionId,
        channelId: session.channelId,
        codec: session.codec,
        quality: session.quality,
        viewerCount: session.viewerCount
      },
      'viewer released'
    )

    if (session.viewerCount > 0) return

    // Schedule idle kill
    session.idleTimer = setTimeout(async () => {
      managerLogger.info(
        { sessionId, channelId: session.channelId, codec: session.codec, quality: session.quality },
        'idle timer fired — shutting down session'
      )
      await killSession(session)
    }, env.HLS_IDLE_KILL_MS)

    managerLogger.debug(
      { sessionId, channelId: session.channelId, idleMs: env.HLS_IDLE_KILL_MS },
      'idle timer scheduled'
    )
  },

  /**
   * Return live stream diagnostics for a session, combining transcoder stats
   * with session metadata. Returns null for unknown sessionIds.
   *
   * bufferSec is always 0 server-side; the client overlays the real value from hls.js.
   */
  getStreamInfo(sessionId: string): StreamInfo | null {
    const key = bySession.get(sessionId)
    if (!key) return null

    const session = byKey.get(key)
    if (!session) return null

    const stats = session.handle.getStats()

    return {
      codec: session.codec,
      resolution: session.resolution,
      bitrate: stats.bitrateKbps,
      fps: stats.fps,
      hwAccel: env.HW_ACCEL_TYPE,
      viewerCount: session.viewerCount,
      droppedFrames: stats.droppedFrames,
      bufferSec: 0
    }
  },

  /** Kill all active sessions. Called on SIGTERM / SIGINT. */
  async shutdownAll(): Promise<void> {
    const sessions = [...byKey.values()]
    managerLogger.info({ count: sessions.length }, 'shutting down all sessions')

    await Promise.all(
      sessions.map(async (session) => {
        if (session.idleTimer !== null) clearTimeout(session.idleTimer)
        await killSession(session)
      })
    )
  },

  /**
   * Resolve a sessionId to its output directory path.
   * Returns null if the session does not exist.
   */
  getSessionDir(sessionId: string): string | null {
    const key = bySession.get(sessionId)
    if (!key) return null
    return byKey.get(key)?.outputDir ?? null
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function killSession(session: Session): Promise<void> {
  const { sessionId, channelId, codec, quality, outputDir, handle } = session

  try {
    await handle.abort()
  } catch (err) {
    managerLogger.warn({ sessionId, channelId, codec, quality, err }, 'error during handle.abort()')
  }

  await rmDir(outputDir)
  teardownEntry(sessionId)

  managerLogger.info({ sessionId, channelId, codec, quality }, 'session torn down')
}

/** Remove map entries for a session. Safe to call multiple times. */
function teardownEntry(sessionId: string): void {
  const key = bySession.get(sessionId)
  if (key) {
    byKey.delete(key)
    bySession.delete(sessionId)
  }
}

async function rmDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch (err) {
    managerLogger.warn({ dir, err }, 'failed to remove session dir')
  }
}
