import { access, mkdir, rm } from 'node:fs/promises'
import { env } from '../lib/config'
import { buildFfmpegArgs, type HwAccel } from '../lib/ffmpeg'
import { logger } from '../lib/logger'

export interface TranscoderHandle {
  sessionId: string
  outputDir: string
  playlistPath: string
  /** Resolves when FFmpeg exits (normal or killed). */
  exited: Promise<number>
  /** Cancels the upstream source, kills FFmpeg, waits for exit, deletes output dir. */
  abort: () => Promise<void>
}

export interface StartTranscoderOptions {
  sessionId: string
  /** Upstream MPEG-TS stream (Mirakc live, file read stream, fixture, …). */
  source: ReadableStream<Uint8Array>
  /** Abort controller exposed so the stream-manager can pass it down. */
  abortController?: AbortController
  hwAccel?: HwAccel
  videoBitrate?: number
  audioBitrate?: number
  segmentSeconds?: number
  listSize?: number
}

/**
 * Spawn an FFmpeg transcode job that turns an incoming MPEG-TS stream into a
 * live HLS playlist at `${HLS_DIR}/${sessionId}/`. Returns once FFmpeg has
 * written the first `playlist.m3u8` or throws if it doesn't appear in time.
 *
 * Why wait on the playlist rather than returning immediately:
 *   the client hits /playlist.m3u8 as soon as the POST /api/streams/live
 *   response comes back. If we return before FFmpeg flushes the playlist,
 *   hls.js gets a 404 and spirals into retries. Waiting a few hundred ms
 *   here is cheaper than burning hls.js's retry budget.
 */
export async function startTranscoder(opts: StartTranscoderOptions): Promise<TranscoderHandle> {
  const {
    sessionId,
    source,
    abortController = new AbortController(),
    hwAccel = 'none',
    videoBitrate,
    audioBitrate,
    segmentSeconds,
    listSize
  } = opts

  const outputDir = `${env.HLS_DIR}/${sessionId}`
  const playlistPath = `${outputDir}/playlist.m3u8`

  await mkdir(outputDir, { recursive: true })

  const args = buildFfmpegArgs({
    hwAccel,
    outputDir,
    ...(videoBitrate !== undefined ? { videoBitrate } : {}),
    ...(audioBitrate !== undefined ? { audioBitrate } : {}),
    ...(segmentSeconds !== undefined ? { segmentSeconds } : {}),
    ...(listSize !== undefined ? { listSize } : {})
  })

  const proc = Bun.spawn(['ffmpeg', ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })

  // Pump source → ffmpeg stdin. If the source closes, ffmpeg sees EOF and
  // finalizes the playlist. If ffmpeg exits first, we detach.
  const pumpPromise = (async () => {
    try {
      const reader = source.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          proc.stdin.write(value)
        }
      }
      await proc.stdin.end()
    } catch (err) {
      logger.debug({ module: 'transcoder', sessionId, err }, 'source pump ended')
      try {
        await proc.stdin.end()
      } catch {
        // already closed
      }
    }
  })()

  // Drain stderr so the pipe doesn't block ffmpeg. Log each line at debug.
  const stderrDrain = (async () => {
    const decoder = new TextDecoder()
    const reader = proc.stderr.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const line = decoder.decode(value, { stream: true }).trim()
      if (line) logger.debug({ module: 'transcoder', sessionId }, line)
    }
  })()

  const exited = (async () => {
    const code = await proc.exited
    await Promise.allSettled([pumpPromise, stderrDrain])
    return code
  })()

  try {
    await waitForPlaylist(playlistPath, 5_000)
  } catch (err) {
    // Playlist never arrived — FFmpeg is likely broken. Tear down before we
    // surface the error to the caller so we don't leak an orphan process.
    abortController.abort()
    proc.kill()
    await exited.catch(() => 0)
    await rm(outputDir, { recursive: true, force: true }).catch(() => {})
    throw err
  }

  const abort = async () => {
    abortController.abort()
    proc.kill()
    await exited.catch(() => 0)
    await rm(outputDir, { recursive: true, force: true }).catch((err) => {
      logger.debug({ module: 'transcoder', sessionId, err }, 'cleanup rm failed (already gone?)')
    })
  }

  return { sessionId, outputDir, playlistPath, exited, abort }
}

/** Polls the filesystem for the playlist file. Resolves once it exists. */
export async function waitForPlaylist(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const interval = 50
  while (Date.now() < deadline) {
    try {
      await access(path)
      return
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`playlist not produced within ${timeoutMs}ms: ${path}`)
}
