// Transcoder: wraps a single FFmpeg process fed from a Mirakc ReadableStream.
// All encoder flag tuning lives in lib/ffmpeg.ts — never add flags here.

import { buildFfmpegArgs, type HwAccel } from '../lib/ffmpeg'
import { logger } from '../lib/logger'

type DebugLogger = { debug: (msg: string | object, ...args: unknown[]) => void }

export type TranscoderHandle = {
  /** Kill FFmpeg, cancel the source stream, and wait for the process to exit. Idempotent. */
  abort: () => Promise<void>
  /** Resolves with the FFmpeg exit code when the process terminates. */
  exited: Promise<number>
  /** Resolves when playlist.m3u8 exists in outputDir, or throws 'playlist_timeout'. */
  waitForPlaylist: (timeoutMs: number) => Promise<void>
}

export type StartTranscoderOpts = {
  sessionId: string
  /** Absolute path to the session output directory. Must exist before calling. */
  outputDir: string
  /** Mirakc MPEG-TS ReadableStream — will be pumped into FFmpeg stdin. */
  source: ReadableStream<Uint8Array>
  hwAccel: HwAccel
}

/**
 * Spawn FFmpeg, pipe `source` into stdin, and return control handles.
 *
 * The caller owns the session directory; this function does NOT mkdir.
 * On abort the source stream is cancelled before proc.kill() to prevent
 * the pump IIFE from racing against a closed stdin.
 */
export function startTranscoder(opts: StartTranscoderOpts): TranscoderHandle {
  const { sessionId, outputDir, source, hwAccel } = opts

  const childLogger = logger.child({ module: 'transcoder', sessionId })

  const args = buildFfmpegArgs({ hwAccel, outputDir })

  childLogger.debug({ args }, 'spawning ffmpeg')

  const proc = Bun.spawn(['ffmpeg', ...args], {
    stdin: 'pipe',
    stdout: 'ignore',
    stderr: 'pipe'
    // onExit fires after the process actually terminates; the `exited`
    // promise below also resolves at that point.
  })

  // Pipe stderr to pino at debug level — one log entry per line.
  // We do not await this; it runs concurrently and is best-effort.
  pipeStderrToLogger(proc.stderr, childLogger)

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
    waitForPlaylist
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pipeStderrToLogger(stderr: ReadableStream<Uint8Array>, childLogger: DebugLogger): Promise<void> {
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
        if (line.trim()) childLogger.debug(line)
      }
    }
    // Flush any remaining partial line
    if (buffer.trim()) childLogger.debug(buffer)
  } catch {
    // Stream closed abruptly; nothing to do
  }
}
