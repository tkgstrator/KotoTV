// Stream manager: session lifecycle, viewer ref-counting, idle timeout.
// One FFmpeg process per unique (channelId); viewers share the same session.

import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../lib/config'
import { logger } from '../lib/logger'
import { mirakcClient } from './mirakc-client'
import { startTranscoder, type TranscoderHandle } from './transcoder'

type Session = {
  sessionId: string
  channelId: string
  outputDir: string
  handle: TranscoderHandle
  viewerCount: number
  /** Timer scheduled to kill the session after all viewers leave. */
  idleTimer: ReturnType<typeof setTimeout> | null
  createdAt: number
}

/** channelId → Session */
const byChannel = new Map<string, Session>()
/** sessionId → channelId (reverse index for O(1) release) */
const bySession = new Map<string, string>()

const managerLogger = logger.child({ module: 'stream-manager' })

export const streamManager = {
  /**
   * Acquire (or join) a live HLS session for the given channel.
   * Returns the sessionId and a relative playlist URL ready for the client.
   */
  async acquireLive(channelId: string): Promise<{ sessionId: string; playlistUrl: string }> {
    const existing = byChannel.get(channelId)
    if (existing) {
      // Cancel any pending idle shutdown — a viewer is back.
      if (existing.idleTimer !== null) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = null
        managerLogger.debug({ sessionId: existing.sessionId, channelId }, 'idle timer cancelled — viewer rejoined')
      }
      existing.viewerCount++
      managerLogger.debug(
        { sessionId: existing.sessionId, channelId, viewerCount: existing.viewerCount },
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

    managerLogger.info({ sessionId, channelId, outputDir }, 'starting new live session')

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
        hwAccel
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
      managerLogger.error({ sessionId, channelId, err }, 'playlist_timeout — tearing down session')
      await handle.abort()
      await rmDir(outputDir)
      throw err
    }

    const session: Session = {
      sessionId,
      channelId,
      outputDir,
      handle,
      viewerCount: 1,
      idleTimer: null,
      createdAt: Date.now()
    }

    byChannel.set(channelId, session)
    bySession.set(sessionId, channelId)

    managerLogger.info({ sessionId, channelId }, 'live session ready')

    // If FFmpeg exits unexpectedly, clean up the maps so the next
    // acquireLive call starts fresh instead of returning a dead session.
    handle.exited.then((code) => {
      managerLogger.warn({ sessionId, channelId, code }, 'ffmpeg exited unexpectedly — removing session')
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
    const channelId = bySession.get(sessionId)
    if (!channelId) return

    const session = byChannel.get(channelId)
    if (!session) return

    session.viewerCount = Math.max(0, session.viewerCount - 1)

    managerLogger.debug({ sessionId, channelId, viewerCount: session.viewerCount }, 'viewer released')

    if (session.viewerCount > 0) return

    // Schedule idle kill
    session.idleTimer = setTimeout(async () => {
      managerLogger.info({ sessionId, channelId }, 'idle timer fired — shutting down session')
      await killSession(session)
    }, env.HLS_IDLE_KILL_MS)

    managerLogger.debug({ sessionId, channelId, idleMs: env.HLS_IDLE_KILL_MS }, 'idle timer scheduled')
  },

  /** Kill all active sessions. Called on SIGTERM / SIGINT. */
  async shutdownAll(): Promise<void> {
    const sessions = [...byChannel.values()]
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
    const channelId = bySession.get(sessionId)
    if (!channelId) return null
    return byChannel.get(channelId)?.outputDir ?? null
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function killSession(session: Session): Promise<void> {
  const { sessionId, channelId, outputDir, handle } = session

  try {
    await handle.abort()
  } catch (err) {
    managerLogger.warn({ sessionId, channelId, err }, 'error during handle.abort()')
  }

  await rmDir(outputDir)
  teardownEntry(sessionId)

  managerLogger.info({ sessionId, channelId }, 'session torn down')
}

/** Remove map entries for a session. Safe to call multiple times. */
function teardownEntry(sessionId: string): void {
  const channelId = bySession.get(sessionId)
  if (channelId) {
    byChannel.delete(channelId)
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
