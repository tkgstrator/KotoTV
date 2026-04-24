// Stream manager: session lifecycle, viewer ref-counting, idle timeout.
// One FFmpeg process per unique (channelId, codec, quality); viewers share the same session.

import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../lib/config'
import {
  buildRecordingHlsArgs,
  type Codec,
  type HwAccel,
  QUALITY_PRESETS,
  type Quality,
  resolutionFor
} from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import type { StreamInfo } from '../schemas/Stream.dto'
import { mirakcClient } from './mirakc-client'
import { startTranscoder, type TranscoderHandle } from './transcoder'

// ---------------------------------------------------------------------------
// Session key
// ---------------------------------------------------------------------------

type SessionKey = `${string}|${'avc' | 'hevc'}|${'low' | 'mid' | 'high'}` | `recording|${string}`

function sessionKey(channelId: string, codec: Codec, quality: Quality): SessionKey {
  return `${channelId}|${codec}|${quality}` as SessionKey
}

function recordingSessionKey(recordingId: string): SessionKey {
  return `recording|${recordingId}` as SessionKey
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
// Orphan cleanup — runs once at module init
// ---------------------------------------------------------------------------

/**
 * Remove HLS session directories that are not tracked in the in-memory session
 * maps. These are leftovers from a previous server crash and would otherwise
 * accumulate on the tmpfs until it fills up.
 */
async function cleanOrphanSessions(): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(env.HLS_DIR)
  } catch {
    // HLS_DIR may not exist yet on a fresh start; that's fine
    return
  }

  const orphans = entries.filter((name) => !bySession.has(name))
  if (orphans.length === 0) return

  await Promise.all(
    orphans.map(async (name) => {
      const dir = path.join(env.HLS_DIR, name)
      try {
        await rm(dir, { recursive: true, force: true })
        managerLogger.info({ dir }, 'cleaned orphan HLS session dir')
      } catch (err) {
        managerLogger.warn({ dir, err }, 'failed to remove orphan HLS session dir')
      }
    })
  )

  managerLogger.info({ count: orphans.length }, 'orphan cleanup complete')
}

// Run immediately at module load; errors are non-fatal
cleanOrphanSessions().catch((err) => {
  managerLogger.warn({ err }, 'orphan cleanup failed')
})

// ---------------------------------------------------------------------------
// HLS directory size monitor — periodic check every 60 s
// ---------------------------------------------------------------------------

const HLS_SIZE_WARN_BYTES = 400 * 1024 * 1024 // 400 MB out of 512 MB tmpfs

let sizeMonitorTimer: ReturnType<typeof setInterval> | null = null

async function checkHlsDirSize(): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(env.HLS_DIR)
  } catch {
    return
  }

  let totalBytes = 0
  await Promise.all(
    entries.map(async (name) => {
      const sessionDir = path.join(env.HLS_DIR, name)
      let sessionFiles: string[]
      try {
        sessionFiles = await readdir(sessionDir)
      } catch {
        return
      }
      await Promise.all(
        sessionFiles.map(async (file) => {
          try {
            const s = await stat(path.join(sessionDir, file))
            totalBytes += s.size
          } catch {
            // file may have been deleted by FFmpeg's delete_segments flag
          }
        })
      )
    })
  )

  if (totalBytes > HLS_SIZE_WARN_BYTES) {
    managerLogger.warn(
      { totalMB: Math.round(totalBytes / 1024 / 1024), limitMB: Math.round(HLS_SIZE_WARN_BYTES / 1024 / 1024) },
      'HLS_DIR approaching tmpfs capacity limit'
    )
  } else {
    managerLogger.debug({ totalMB: Math.round(totalBytes / 1024 / 1024) }, 'HLS_DIR size check OK')
  }
}

function startSizeMonitor(): void {
  if (sizeMonitorTimer !== null) return
  sizeMonitorTimer = setInterval(() => {
    void checkHlsDirSize()
  }, 60_000)
  // Don't keep the event loop alive just for size monitoring
  sizeMonitorTimer.unref?.()
}

function stopSizeMonitor(): void {
  if (sizeMonitorTimer === null) return
  clearInterval(sizeMonitorTimer)
  sizeMonitorTimer = null
}

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
   * Acquire (or join) a VOD HLS session for a recorded file.
   * Session key is `recording|${recordingId}` so multiple viewers of the same
   * recording share one FFmpeg process.
   */
  async acquireRecording(recordingId: string, filePath: string): Promise<{ sessionId: string; playlistUrl: string }> {
    const key = recordingSessionKey(recordingId)
    const existing = byKey.get(key)

    if (existing) {
      if (existing.idleTimer !== null) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = null
        managerLogger.debug({ sessionId: existing.sessionId, recordingId }, 'idle timer cancelled — viewer rejoined')
      }
      existing.viewerCount++
      managerLogger.debug(
        { sessionId: existing.sessionId, recordingId, viewerCount: existing.viewerCount },
        'viewer joined existing recording session'
      )
      return {
        sessionId: existing.sessionId,
        playlistUrl: `/api/streams/${existing.sessionId}/playlist.m3u8`
      }
    }

    const inFlight = pending.get(key)
    if (inFlight) {
      const session = await inFlight
      session.viewerCount++
      return {
        sessionId: session.sessionId,
        playlistUrl: `/api/streams/${session.sessionId}/playlist.m3u8`
      }
    }

    const bootPromise = bootRecordingSession(recordingId, filePath)
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
    stopSizeMonitor()

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
  startSizeMonitor()
}

function stopWatchdog(): void {
  if (watchdogTimer === null) return
  clearInterval(watchdogTimer)
  watchdogTimer = null
}

async function watchdogScan(): Promise<void> {
  if (byKey.size === 0) {
    stopWatchdog()
    return
  }

  const now = Date.now()
  const threshold = env.HLS_ACCESS_TIMEOUT_MS

  for (const session of [...byKey.values()]) {
    // Task 3: zombie detection — FFmpeg exited but session still tracked.
    // Promise.race with an already-resolved false lets us check without blocking.
    const isExited = await Promise.race([session.handle.exited.then(() => true), Promise.resolve(false)])

    if (isExited) {
      managerLogger.warn(
        { sessionId: session.sessionId, channelId: session.channelId, codec: session.codec, quality: session.quality },
        'watchdog: FFmpeg process already exited but session still tracked — cleaning up zombie'
      )
      if (session.idleTimer !== null) {
        clearTimeout(session.idleTimer)
        session.idleTimer = null
      }
      await rmDir(session.outputDir)
      teardownEntry(session.sessionId)
      continue
    }

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

/**
 * Boot a VOD HLS session from a recorded file. The file is transcoded to HLS
 * segments in a fresh session directory. Uses default quality (mid / avc) as
 * recording playback doesn't originate from a live quality selector.
 */
async function bootRecordingSession(recordingId: string, filePath: string): Promise<Session> {
  const key = recordingSessionKey(recordingId)
  const sessionId = crypto.randomUUID()
  const outputDir = path.join(env.HLS_DIR, sessionId)

  // Default quality/codec for recording playback; could be extended to accept
  // caller-supplied values in a future iteration.
  const codec: Codec = 'avc'
  const quality: Quality = 'mid'
  const hwAccel: HwAccel = env.HW_ACCEL_TYPE
  const resolution = resolutionFor(quality)

  managerLogger.info({ sessionId, recordingId, filePath, outputDir }, 'starting new recording playback session')

  await mkdir(outputDir, { recursive: true })

  const args = buildRecordingHlsArgs({ inputPath: filePath, outputDir, codec, quality, hwAccel })

  // For recording playback, we use a synthetic ReadableStream that immediately
  // closes — FFmpeg reads from the file path directly (not stdin).
  // We reuse startTranscoder's process structure but bypass stdin piping by
  // spawning FFmpeg directly here.
  let handle: TranscoderHandle
  try {
    handle = startRecordingTranscoder({ sessionId, outputDir, args })
  } catch (err) {
    await rmDir(outputDir)
    throw err
  }

  try {
    await handle.waitForPlaylist(60_000)
  } catch (err) {
    managerLogger.error({ sessionId, recordingId, err }, 'recording playlist_timeout — tearing down session')
    await handle.abort()
    await rmDir(outputDir)
    throw err
  }

  const now = Date.now()
  const session: Session = {
    sessionId,
    channelId: recordingId, // repurpose channelId field to store recordingId for logging
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

  managerLogger.info({ sessionId, recordingId }, 'recording playback session ready')

  handle.exited.then((code) => {
    // VOD transcode finishing normally (exit 0) is expected — don't log as error
    if (code === 0) {
      managerLogger.info({ sessionId, recordingId }, 'recording transcode completed')
    } else {
      managerLogger.warn({ sessionId, recordingId, code }, 'recording ffmpeg exited — removing session')
    }
    teardownEntry(sessionId)
  })

  return session
}

// ---------------------------------------------------------------------------
// Recording-specific transcoder (file input, no stdin pump)
// ---------------------------------------------------------------------------

type RecordingTranscoderOpts = {
  sessionId: string
  outputDir: string
  args: string[]
}

/**
 * Spawn FFmpeg for recording VOD HLS. Unlike startTranscoder there is no stdin
 * pump — FFmpeg reads the file directly via the -i <path> arg.
 */
function startRecordingTranscoder(opts: RecordingTranscoderOpts): TranscoderHandle {
  const { sessionId, outputDir, args } = opts

  const childLogger = logger.child({ module: 'transcoder-recording', sessionId })
  childLogger.debug({ args }, 'spawning ffmpeg for recording playback')

  const proc = Bun.spawn(['ffmpeg', ...args], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe'
  })

  // Pipe stderr to pino at debug level
  pipeStderrToLogger(proc.stderr, childLogger)

  let abortCalled = false

  const abort = async (): Promise<void> => {
    if (abortCalled) return
    abortCalled = true
    try {
      proc.kill()
    } catch {
      // Process may already have exited
    }
    await proc.exited
  }

  const playlistPath = `${outputDir}/playlist.m3u8`

  const waitForPlaylist = async (timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await Bun.file(playlistPath).exists()) return
      await sleep(100)
    }
    throw new Error('playlist_timeout')
  }

  return {
    abort,
    exited: proc.exited,
    waitForPlaylist,
    getStats: () => ({
      frame: 0,
      fps: 0,
      bitrateKbps: 0,
      droppedFrames: 0,
      updatedAt: Date.now()
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pipeStderrToLogger(
  stderr: ReadableStream<Uint8Array>,
  childLogger: { debug: (msg: string | object, ...args: unknown[]) => void }
): Promise<void> {
  const decoder = new TextDecoder()
  const reader = stderr.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) childLogger.debug(line)
      }
    }
    if (buffer.trim()) childLogger.debug(buffer)
  } catch {
    // Stream closed abruptly; nothing to do
  }
}
