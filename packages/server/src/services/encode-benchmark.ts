// Encode-profile benchmark service.
// Single-flight: only one benchmark may run at a time (server-wide).
// Persistence: every run writes a BenchmarkLog row and prunes to the last 100.

import { type BenchmarkArgsOptions, buildBenchmarkArgs } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'

export type BenchmarkResult = {
  ok: boolean
  fps: number
  wallSeconds: number
  reason?: string
}

// Decisions #5 — Japanese broadcast is 29.97 / 59.94 fps; realtime bar is 30000/1001.
export const MIN_REALTIME_FPS = 30_000 / 1001 // 29.97002997...

// Number of BenchmarkLog rows to keep (pruned inline on every insert).
export const HISTORY_KEEP = 100

// Max chars stored in the `reason` column.
export const REASON_MAX_CHARS = 2000

// Default timeout for a benchmark run in ms.
// Can be overridden via the second argument to benchmarkProfile (for tests).
const DEFAULT_BENCH_TIMEOUT_MS = 30_000

// FFmpeg progress-line regex (same pattern as transcoder.ts:46).
const STATS_RE =
  /frame=\s*(\d+)\s+fps=\s*([\d.]+)\s+q=\S+(?:\s+L?size=\s*\S+\s+time=\S+\s+bitrate=\s*(?:([\d.]+)kbits\/s|N\/A))?(?:.*?drop(?:ped)?=\s*(\d+))?/g

// Module-level single-flight gate. Mirrors the pending map in stream-manager.ts
// but degenerate (one slot): benchmarking pins one encoder slot, so running two
// simultaneously would skew both results and starve real recording GPU bandwidth.
let running: Promise<BenchmarkResult> | null = null

/** Returns true while a benchmark is in progress. */
export function isBenchmarkBusy(): boolean {
  return running !== null
}

export type BenchmarkProfileOpts = BenchmarkArgsOptions & {
  // DB-layer hwAccel — 'cpu' maps to ffmpeg's 'none'; 'qsv' is not in the DB enum
  // so it maps to 'cpu' for storage purposes.
  dbHwAccel?: 'cpu' | 'nvenc' | 'vaapi'
  codec: 'avc' | 'hevc'
  rateControl: 'cbr' | 'vbr' | 'cqp'
  resolution: 'hd1080' | 'hd720' | 'sd480'
  // FK to the EncodeProfile row this bench was triggered for. Optional so
  // admin-triggered and test invocations don't have to supply a profile.
  profileId?: string
}

/**
 * Run a benchmark for the given profile options.
 *
 * Throws Error('benchmark_busy') if another run is already in progress.
 * The HTTP route translates this to HTTP 409.
 *
 * @param opts  FFmpeg benchmark options (hwAccel is the ffmpeg type: 'none'|'nvenc'|'qsv'|'vaapi').
 * @param overrides  Test-only overrides (timeoutMs).
 */
export async function benchmarkProfile(
  opts: BenchmarkProfileOpts,
  overrides?: { timeoutMs?: number }
): Promise<BenchmarkResult> {
  if (running !== null) throw new Error('benchmark_busy')
  running = runOnce(opts, overrides?.timeoutMs ?? DEFAULT_BENCH_TIMEOUT_MS).finally(() => {
    running = null
  })
  return running
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function runOnce(opts: BenchmarkProfileOpts, timeoutMs: number): Promise<BenchmarkResult> {
  const t0 = performance.now()
  const childLogger = logger.child({ module: 'encode-benchmark' })

  const args = buildBenchmarkArgs(opts)
  childLogger.debug({ args }, 'spawning ffmpeg benchmark')

  const proc = Bun.spawn(['ffmpeg', ...args], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe'
  })

  // Track latest fps and frame count. FFmpeg doesn't always print an fps=
  // line for jobs that complete in under its stats interval, so we also
  // track frame= and fall back to frame / wallSeconds below.
  let lastFps: number | null = null
  let lastFrame: number | null = null
  const stderrLines: string[] = []

  // AbortController drives the hard timeout.
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  // Pipe stderr: parse fps= / frame= lines and buffer last ~20 lines for error reporting.
  const stderrDone = pipeAndParseBenchmarkStderr(
    proc.stderr,
    childLogger,
    stderrLines,
    (fps) => {
      lastFps = fps
    },
    (frame) => {
      lastFrame = frame
    }
  )

  // Race the process exit against the abort signal.
  let exitCode: number | null = null
  let timedOut = false

  try {
    exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
      })
    ])
  } catch (err) {
    if ((err as Error).message === 'timeout') {
      timedOut = true
      // Two-stage kill: SIGTERM first, then SIGKILL after 1 s.
      try {
        proc.kill('SIGTERM')
      } catch {
        // already exited
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
      try {
        proc.kill('SIGKILL')
      } catch {
        // already dead
      }
      // Wait for the process to actually exit before returning.
      await proc.exited.catch(() => {})
    }
  } finally {
    clearTimeout(timeoutHandle)
  }

  // Drain remaining stderr before we inspect lines.
  await stderrDone.catch(() => {})

  const wallSeconds = (performance.now() - t0) / 1000

  // Fallback when FFmpeg didn't print a fps= line (short jobs / no stats
  // interval elapsed): derive fps from the final frame count and wall time.
  const derivedFps = lastFrame != null && wallSeconds > 0 ? lastFrame / wallSeconds : null
  const fps = lastFps ?? derivedFps ?? 0

  let result: BenchmarkResult

  if (timedOut) {
    result = { ok: false, fps, wallSeconds, reason: 'timeout' }
  } else if (exitCode !== 0) {
    const tail = stderrLines.slice(-20).join('\n')
    result = { ok: false, fps, wallSeconds, reason: tail }
  } else if (fps >= MIN_REALTIME_FPS) {
    result = { ok: true, fps, wallSeconds }
  } else {
    result = { ok: false, fps, wallSeconds, reason: 'below_realtime' }
  }

  logger.info({ result, opts }, 'encode benchmark done')

  // Persist the result. Failure here is isolated — the caller still gets their result.
  await persistResult(opts, result).catch((err) => {
    logger.warn({ err }, 'encode benchmark persistence failed')
  })

  return result
}

async function persistResult(opts: BenchmarkProfileOpts, result: BenchmarkResult): Promise<void> {
  // Map ffmpeg HwAccel ('none'/'qsv') to the DB HwAccelType enum ('cpu'/'vaapi').
  // 'qsv' is not in the DB enum; store as 'cpu' (best approximation for history).
  const dbHwAccel: 'cpu' | 'nvenc' | 'vaapi' =
    opts.hwAccel === 'nvenc' ? 'nvenc' : opts.hwAccel === 'vaapi' ? 'vaapi' : 'cpu'

  await prisma.$transaction(async (tx) => {
    await tx.benchmarkLog.create({
      data: {
        profileId: opts.profileId ?? null,
        codec: opts.codec,
        hwAccel: dbHwAccel,
        rateControl: opts.rateControl,
        bitrateKbps: opts.bitrateKbps,
        qpValue: opts.qpValue,
        keepOriginalResolution: opts.keepOriginalResolution,
        resolution: opts.resolution,
        ok: result.ok,
        fps: result.fps,
        wallSeconds: result.wallSeconds,
        reason: result.reason != null ? result.reason.slice(0, REASON_MAX_CHARS) : null
      }
    })

    // Keep only the newest HISTORY_KEEP rows.
    // Atomicity: insert + prune in one transaction — if prune fails, insert rolls back
    // so the table cannot grow unboundedly even on transient errors.
    await tx.$executeRaw`
      DELETE FROM "benchmark_logs"
       WHERE "id" NOT IN (
         SELECT "id" FROM "benchmark_logs"
          ORDER BY "created_at" DESC
          LIMIT ${HISTORY_KEEP}
       )
    `
  })
}

async function pipeAndParseBenchmarkStderr(
  stderr: ReadableStream<Uint8Array>,
  childLogger: { debug: (msg: string | object, ...args: unknown[]) => void },
  linesBuffer: string[],
  onFps: (fps: number) => void,
  onFrame: (frame: number) => void
): Promise<void> {
  const decoder = new TextDecoder()
  const reader = stderr.getReader()
  let buf = ''

  function parseLine(line: string): void {
    if (!line.trim()) return
    childLogger.debug(line)
    linesBuffer.push(line)
    STATS_RE.lastIndex = 0
    let last: RegExpExecArray | null = null
    for (;;) {
      const m = STATS_RE.exec(line)
      if (m === null) break
      last = m
    }
    if (last) {
      const frame = Number.parseInt(last[1] ?? '0', 10)
      const fps = Number.parseFloat(last[2] ?? '0')
      if (frame > 0) onFrame(frame)
      if (fps > 0) onFps(fps)
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // FFmpeg emits progress updates separated by \r and terminal lines by
      // \n; split on either so we don't miss either stream.
      const lines = buf.split(/[\r\n]/)
      buf = lines.pop() ?? ''
      for (const line of lines) parseLine(line)
    }
    // Short jobs often leave the final "frame= X fps= Y" summary in the
    // pending buffer — parse it before giving up.
    if (buf.trim()) parseLine(buf)
  } catch {
    // Stream closed abruptly
  }
}
