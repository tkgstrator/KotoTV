// Stream manager: session lifecycle, viewer ref-counting, idle timeout.
// One FFmpeg process per unique (channelId, codec, quality); viewers share the same session.

import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../lib/config'
import { type Codec, QUALITY_PRESETS, type Quality, resolutionFor } from '../lib/ffmpeg'
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
  /** Last time a client fetched playlist.m3u8 or a segment. Updated by
   * getSessionDir(); consulted by the access watchdog. */
  lastAccessAt: number
}

/** (channelId|codec|quality) → Session */
const byKey = new Map<SessionKey, Session>()
/** sessionId → SessionKey (reverse index for O(1) release / lookup) */
const bySession = new Map<string, SessionKey>()
/**
 * Concurrent acquireLive calls for the same key share this promise so that only
 * one FFmpeg process is spawned; subsequent callers await the resolved Session
 * and bump viewerCount.
 */
const pending = new Map<SessionKey, Promise<Session>>()

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

    // Concurrent acquires for the same key share a single FFmpeg boot.
    const inFlight = pending.get(key)
    if (inFlight) {
      const session = await inFlight
      session.viewerCount++
      managerLogger.debug(
        { sessionId: session.sessionId, channelId, codec, quality, viewerCount: session.viewerCount },
        'viewer joined in-flight session'
      )
      return {
        sessionId: session.sessionId,
        playlistUrl: `/api/streams/${session.sessionId}/playlist.m3u8`
      }
    }

    const bootPromise = bootSession(channelId, codec, quality)
    pending.set(key, bootPromise)
    let session: Session
    try {
      session = await bootPromise
    } finally {
      pending.delete(key)
    }

    return {
      sessionId: session.sessionId,
      playlistUrl: `/api/streams/${session.sessionId}/playlist.m3u8`
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
    // FFmpeg's HLS muxer reports size=N/A, so stderr never yields a numeric
    // bitrate. Fall back to the configured target from the quality preset
    // when the measured value is zero.
    const targetBitrate = QUALITY_PRESETS[session.quality].bitrate
    const bitrate = stats.bitrateKbps > 0 ? stats.bitrateKbps : targetBitrate

    return {
      codec: session.codec,
      resolution: session.resolution,
      bitrate,
      fps: stats.fps > 0 ? stats.fps : QUALITY_PRESETS[session.quality].fps,
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

    stopWatchdog()

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
   *
   * Side effect: bumps the session's lastAccessAt so the access watchdog
   * knows the client is still pulling bytes.
   */
  getSessionDir(sessionId: string): string | null {
    const key = bySession.get(sessionId)
    if (!key) return null
    const session = byKey.get(key)
    if (!session) return null
    session.lastAccessAt = Date.now()
    return session.outputDir
  }
}

// ---------------------------------------------------------------------------
// Access watchdog
// ---------------------------------------------------------------------------

/** Lazily-started interval that kills sessions with no recent client access.
 * Started on first bootSession, stopped on shutdownAll or when the map empties
 * naturally (the scan itself clears the timer when no sessions remain). */
let watchdogTimer: ReturnType<typeof setInterval> | null = null

function startWatchdog(): void {
  if (watchdogTimer !== null) return
  watchdogTimer = setInterval(watchdogScan, env.HLS_WATCHDOG_INTERVAL_MS)
  // Don't keep the event loop alive just for this timer.
  watchdogTimer.unref?.()
}

function stopWatchdog(): void {
  if (watchdogTimer === null) return
  clearInterval(watchdogTimer)
  watchdogTimer = null
}

function watchdogScan(): void {
  if (byKey.size === 0) {
    stopWatchdog()
    return
  }

  const now = Date.now()
  const threshold = env.HLS_ACCESS_TIMEOUT_MS

  for (const session of [...byKey.values()]) {
    const idleMs = now - session.lastAccessAt
    if (idleMs <= threshold) continue

    managerLogger.warn(
      {
        sessionId: session.sessionId,
        channelId: session.channelId,
        codec: session.codec,
        quality: session.quality,
        viewerCount: session.viewerCount,
        idleSec: Math.round(idleMs / 1000)
      },
      'watchdog: no client access — killing orphaned session'
    )

    if (session.idleTimer !== null) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
    void killSession(session)
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

/**
 * Boot a fresh FFmpeg session and register it with the maps. Caller holds the
 * `pending` entry until this resolves; concurrent acquirers share the promise.
 * The returned Session starts with `viewerCount: 1` for the caller that
 * initiated the boot.
 */
async function bootSession(channelId: string, codec: Codec, quality: Quality): Promise<Session> {
  const key = sessionKey(channelId, codec, quality)
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

  try {
    await handle.waitForPlaylist(15_000)
  } catch (err) {
    managerLogger.error({ sessionId, channelId, codec, quality, err }, 'playlist_timeout — tearing down session')
    await handle.abort()
    await rmDir(outputDir)
    throw err
  }

  const now = Date.now()
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
    createdAt: now,
    lastAccessAt: now
  }

  byKey.set(key, session)
  bySession.set(sessionId, key)
  startWatchdog()

  managerLogger.info({ sessionId, channelId, codec, quality }, 'live session ready')

  handle.exited.then((code) => {
    managerLogger.warn({ sessionId, channelId, codec, quality, code }, 'ffmpeg exited unexpectedly — removing session')
    teardownEntry(sessionId)
  })

  return session
}
