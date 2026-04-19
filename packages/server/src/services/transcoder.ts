// Transcoder: wraps a single FFmpeg process fed from a Mirakc ReadableStream.
// All encoder flag tuning lives in lib/ffmpeg.ts — never add flags here.

import { buildFfmpegArgs, type Codec, type HwAccel, type Quality } from '../lib/ffmpeg'
import { logger } from '../lib/logger'

type DebugLogger = { debug: (msg: string | object, ...args: unknown[]) => void }

export type TranscoderStats = {
  frame: number
  fps: number
  bitrateKbps: number
  droppedFrames: number
  /** Unix timestamp (ms) when these stats were last updated. */
  updatedAt: number
}

export type TranscoderHandle = {
  /** Kill FFmpeg, cancel the source stream, and wait for the process to exit. Idempotent. */
  abort: () => Promise<void>
  /** Resolves with the FFmpeg exit code when the process terminates. */
  exited: Promise<number>
  /** Resolves when playlist.m3u8 exists in outputDir, or throws 'playlist_timeout'. */
  waitForPlaylist: (timeoutMs: number) => Promise<void>
  /** Returns a snapshot of the latest FFmpeg progress stats. Always safe to call. */
  getStats: () => TranscoderStats
}

export type StartTranscoderOpts = {
  sessionId: string
  /** Absolute path to the session output directory. Must exist before calling. */
  outputDir: string
  /** Mirakc MPEG-TS ReadableStream — will be pumped into FFmpeg stdin. */
  source: ReadableStream<Uint8Array>
  hwAccel: HwAccel
  codec: Codec
  quality: Quality
}

// Regex that tolerates FFmpeg's variable whitespace in progress lines.
// Example: "frame= 1234 fps= 30 q=... bitrate= 2987.1kbits/s ... drop=0 ..."
// Also handles "dropped=N" and "dup=N drop=N" variants.
const STATS_RE = /frame=\s*(\d+).*?fps=\s*([\d.]+).*?bitrate=\s*([\d.]+)kbits\/s.*?(?:drop(?:ped)?=\s*(\d+))?/

/**
 * Spawn FFmpeg, pipe `source` into stdin, and return control handles.
 *
 * The caller owns the session directory; this function does NOT mkdir.
 * On abort the source stream is cancelled before proc.kill() to prevent
 * the pump IIFE from racing against a closed stdin.
 */
export function startTranscoder(opts: StartTranscoderOpts): TranscoderHandle {
  const { sessionId, outputDir, source, hwAccel, codec, quality } = opts

  const childLogger = logger.child({ module: 'transcoder', sessionId })

  const args = buildFfmpegArgs({ hwAccel, codec, quality, outputDir })

  childLogger.debug({ args }, 'spawning ffmpeg')

  const proc = Bun.spawn(['ffmpeg', ...args], {
    stdin: 'pipe',
    stdout: 'ignore',
    stderr: 'pipe'
    // onExit fires after the process actually terminates; the `exited`
    // promise below also resolves at that point.
  })

  // Mutable stats snapshot — updated by the stderr parser as lines arrive.
  let latestStats: TranscoderStats = {
    frame: 0,
    fps: 0,
    bitrateKbps: 0,
    droppedFrames: 0,
    updatedAt: Date.now()
  }

  // Pipe stderr to pino at debug level and parse progress stats.
  // We do not await this; it runs concurrently and is best-effort.
  pipeStderrToLogger(proc.stderr, childLogger, (line) => {
    const m = STATS_RE.exec(line)
    if (m) {
      latestStats = {
        // m[1..3] are guaranteed non-undefined when the regex matches
        frame: Number.parseInt(m[1]!, 10),
        fps: Math.round(Number.parseFloat(m[2]!)),
        bitrateKbps: Math.round(Number.parseFloat(m[3]!)),
        droppedFrames: m[4] !== undefined ? Number.parseInt(m[4], 10) : latestStats.droppedFrames,
        updatedAt: Date.now()
      }
    }
  })

  // Pump source bytes into FFmpeg stdin, respecting backpressure.
  // Runs in a detached async IIFE; errors are logged but do not propagate
  // (the caller detects failure via `waitForPlaylist` or `exited`).
  let aborted = false
  const reader = source.getReader()

  const pumpDone = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (aborted) break
        // Await every write to respect Bun's stdin backpressure.
        await proc.stdin.write(value)
      }
    } catch (err) {
      childLogger.debug({ err }, 'stdin pump error')
    } finally {
      try {
        proc.stdin.end()
      } catch {
        // stdin may already be closed if FFmpeg exited
      }
    }
  })()

  // Ensure pumpDone is never an unhandled rejection
  pumpDone.catch(() => {})

  // Tracks whether abort() has been called so it is idempotent.
  let abortCalled = false

  const abort = async (): Promise<void> => {
    if (abortCalled) return
    abortCalled = true
    aborted = true

    // Cancel the reader first so the pump IIFE unblocks and closes stdin.
    try {
      await reader.cancel()
    } catch {
      // Already cancelled or stream already done
    }

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
    getStats: () => ({ ...latestStats })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pipeStderrToLogger(
  stderr: ReadableStream<Uint8Array>,
  childLogger: DebugLogger,
  onLine?: (line: string) => void
): Promise<void> {
  const decoder = new TextDecoder()
  const reader = stderr.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Emit complete lines; keep the incomplete tail in buffer.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) {
          childLogger.debug(line)
          onLine?.(line)
        }
      }
    }
    // Flush any remaining partial line
    if (buffer.trim()) {
      childLogger.debug(buffer)
      onLine?.(buffer)
    }
  } catch {
    // Stream closed abruptly; nothing to do
  }
}
