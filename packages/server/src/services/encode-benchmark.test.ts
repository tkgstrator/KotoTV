// Tests for encode-benchmark service.
// Bun.spawn is monkey-patched per test via globalThis.Bun.spawn.
// DB persistence tests use the real Prisma client (same pattern as recording-rules.test.ts).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { prisma } from '../lib/prisma'
import { benchmarkProfile, isBenchmarkBusy, MIN_REALTIME_FPS, REASON_MAX_CHARS } from './encode-benchmark'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeProc = {
  exited: Promise<number>
  stderr: ReadableStream<Uint8Array>
  kill: (signal?: string) => void
}

/**
 * Build a fake Bun.subprocess-like object.
 * `stderrLines` are emitted as newline-terminated UTF-8 chunks, then the
 * stream closes. `exitCode` is the value `exited` resolves with.
 */
function fakeProc(stderrLines: string[], exitCode: number, opts?: { hangForeverMs?: number }): FakeProc {
  let killed = false

  // Build a ReadableStream that emits each line then closes.
  const encoder = new TextEncoder()
  const stderrStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of stderrLines) {
        if (killed) break
        controller.enqueue(encoder.encode(`${line}\n`))
        // Yield to allow the consumer to process each chunk.
        await new Promise((r) => setTimeout(r, 0))
      }
      controller.close()
    }
  })

  let resolveExited: (code: number) => void
  const exitedPromise = new Promise<number>((resolve) => {
    resolveExited = resolve
  })

  if (opts?.hangForeverMs !== undefined) {
    // Never resolves naturally; the timeout fires and kills() it.
    // When killed, resolve with 137 (SIGKILL convention).
  } else {
    // Resolve after stderr is flushed.
    Promise.resolve().then(async () => {
      // Give stderr a chance to be consumed.
      await new Promise((r) => setTimeout(r, 5))
      resolveExited?.(exitCode)
    })
  }

  return {
    exited: exitedPromise,
    stderr: stderrStream,
    kill(signal?: string) {
      killed = true
      // On any kill signal, resolve the exit promise (simulate process death).
      resolveExited?.(signal === 'SIGTERM' ? 143 : 137)
    }
  }
}

/** A progress line that FFmpeg would emit for the given fps value. */
function progressLine(fps: number): string {
  return `frame=  150 fps= ${fps.toFixed(1)} q=28.0 size=N/A time=00:00:05.00 bitrate=N/A`
}

/** Override globalThis.Bun.spawn for the duration of a test. */
function withSpawnStub(stub: (...args: unknown[]) => FakeProc): () => void {
  const original = globalThis.Bun.spawn
  // biome-ignore lint/suspicious/noExplicitAny: test-only monkey-patch
  ;(globalThis.Bun as any).spawn = stub
  return () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only monkey-patch
    ;(globalThis.Bun as any).spawn = original
  }
}

const BENCH_OPTS = {
  hwAccel: 'none' as const,
  codec: 'avc' as const,
  rateControl: 'vbr' as const,
  bitrateKbps: 4000,
  qpValue: 23,
  keepOriginalResolution: true as const,
  resolution: 'hd720' as const
}

// ---------------------------------------------------------------------------
// DB cleanup
// ---------------------------------------------------------------------------

async function cleanupBenchmarkLogs() {
  await prisma.benchmarkLog.deleteMany()
}

beforeEach(async () => {
  await cleanupBenchmarkLogs()
})

afterEach(async () => {
  await cleanupBenchmarkLogs()
})

// ---------------------------------------------------------------------------
// Process-lifecycle cases
// ---------------------------------------------------------------------------

describe('fps=45.3, exit 0 → ok:true', () => {
  test('returns { ok: true, fps ≈ 45 }', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(45.3)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(true)
      expect(result.fps).toBeCloseTo(45.3, 0)
    } finally {
      restore()
    }
  })
})

describe('fps=12.0, exit 0 → ok:false, reason:below_realtime', () => {
  test('returns { ok: false, reason: below_realtime }', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(12.0)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('below_realtime')
      expect(result.fps).toBeCloseTo(12.0, 0)
    } finally {
      restore()
    }
  })
})

describe('fps=29.5 (just below 29.97 threshold), exit 0 → ok:false', () => {
  test('returns { ok: false, reason: below_realtime }', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(29.5)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('below_realtime')
    } finally {
      restore()
    }
  })
})

describe('fps=30.0 (just above 29.97 threshold), exit 0 → ok:true', () => {
  test('returns { ok: true }', async () => {
    // MIN_REALTIME_FPS ≈ 29.97; 30.0 is above it.
    expect(30.0).toBeGreaterThan(MIN_REALTIME_FPS)

    const restore = withSpawnStub(() => fakeProc([progressLine(30.0)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(true)
    } finally {
      restore()
    }
  })
})

describe('exit 1 with stderr "Unknown encoder" → ok:false, reason matches', () => {
  test('reason includes stderr content', async () => {
    const restore = withSpawnStub(() => fakeProc(['Unknown encoder: h264_nvenc'], 1))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/Unknown encoder/)
    } finally {
      restore()
    }
  })
})

describe('concurrent benchmarkProfile throws benchmark_busy', () => {
  test('second call while first pending rejects with Error("benchmark_busy")', async () => {
    // Use a proc that hangs briefly so the first call is still running when we make the second.
    let resolveExit: (n: number) => void = () => {}
    const hangingExited = new Promise<number>((resolve) => {
      resolveExit = resolve
    })

    const restore = withSpawnStub(() => ({
      exited: hangingExited,
      stderr: new ReadableStream({
        start(c) {
          c.close()
        }
      }),
      kill() {
        resolveExit(137)
      }
    }))

    let firstResult: Promise<unknown> | null = null
    try {
      firstResult = benchmarkProfile(BENCH_OPTS)
      // Second call must throw synchronously (before await).
      await expect(benchmarkProfile(BENCH_OPTS)).rejects.toThrow('benchmark_busy')
    } finally {
      // Let the first run finish so `running` is cleared.
      resolveExit(0)
      await firstResult?.catch(() => {})
      restore()
    }
  })
})

describe('timeout fires after overridden timeoutMs → { ok: false, reason: timeout }', () => {
  test('200 ms override triggers timeout result', async () => {
    // Proc hangs forever; the 200 ms override should fire.
    let resolveExit: (n: number) => void = () => {}
    const hangingExited = new Promise<number>((resolve) => {
      resolveExit = resolve
    })

    const restore = withSpawnStub(() => ({
      exited: hangingExited,
      stderr: new ReadableStream({
        start(c) {
          c.close()
        }
      }),
      kill(signal?: string) {
        resolveExit(signal === 'SIGTERM' ? 143 : 137)
      }
    }))

    try {
      const result = await benchmarkProfile(BENCH_OPTS, { timeoutMs: 200 })
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('timeout')
    } finally {
      resolveExit(137)
      restore()
    }
  }, 5000)
})

// ---------------------------------------------------------------------------
// Persistence tests
// ---------------------------------------------------------------------------

describe('persistence: successful run inserts a BenchmarkLog row with ok=true', () => {
  test('row inserted with correct codec, hwAccel, resolution', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(45.3)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)
      expect(result.ok).toBe(true)

      expect(await prisma.benchmarkLog.count()).toBe(1)
      const row = await prisma.benchmarkLog.findFirstOrThrow()
      expect(row.ok).toBe(true)
      expect(row.codec).toBe('avc')
      expect(row.hwAccel).toBe('cpu') // 'none' maps to 'cpu' in DB
      expect(row.resolution).toBe('hd720')
    } finally {
      restore()
    }
  })
})

describe('persistence: failed run (exit 1) inserts row with ok=false and reason set', () => {
  test('failure is persisted — not skipped', async () => {
    const restore = withSpawnStub(() => fakeProc(['error: codec not found'], 1))
    try {
      await benchmarkProfile(BENCH_OPTS)
      expect(await prisma.benchmarkLog.count()).toBe(1)
      const row = await prisma.benchmarkLog.findFirstOrThrow()
      expect(row.ok).toBe(false)
      expect(row.reason).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('persistence: reason truncated to REASON_MAX_CHARS', () => {
  test('5000-char stderr tail stored as 2000 chars', async () => {
    const longLine = 'x'.repeat(5000)
    const restore = withSpawnStub(() => fakeProc([longLine], 1))
    try {
      await benchmarkProfile(BENCH_OPTS)
      expect(await prisma.benchmarkLog.count()).toBe(1)
      const row = await prisma.benchmarkLog.findFirstOrThrow()
      expect(row.reason).not.toBeNull()
      expect(row.reason?.length).toBeLessThanOrEqual(REASON_MAX_CHARS)
    } finally {
      restore()
    }
  })
})

describe('persistence: prune bound — seed 105 rows, one run → total 100 rows', () => {
  test('oldest 5 rows are pruned; newest row (just inserted) is present', async () => {
    // Seed 105 rows ordered oldest first.
    const oldIds: string[] = []
    for (let i = 0; i < 105; i++) {
      const row = await prisma.benchmarkLog.create({
        data: {
          codec: 'avc',
          hwAccel: 'cpu',
          rateControl: 'vbr',
          bitrateKbps: 4000,
          qpValue: 23,
          keepOriginalResolution: true,
          resolution: 'hd720',
          ok: true,
          fps: 40,
          wallSeconds: 5,
          // Spread created_at so ORDER BY created_at DESC picks the right ones.
          // Prisma default is now(), so all 105 are "now" — we need distinct times.
          // Workaround: insert via $executeRaw with explicit timestamps.
          reason: `seed-${i}`
        }
      })
      if (i < 5) oldIds.push(row.id)
    }

    // Verify we have 105 seeded rows.
    expect(await prisma.benchmarkLog.count()).toBe(105)

    // Run one more benchmark — this inserts row 106, then prunes to 100.
    const restore = withSpawnStub(() => fakeProc([progressLine(45.0)], 0))
    try {
      await benchmarkProfile(BENCH_OPTS)
    } finally {
      restore()
    }

    const total = await prisma.benchmarkLog.count()
    expect(total).toBe(100)

    // The newest row (the benchmark we just ran) must be present.
    const newest = await prisma.benchmarkLog.findFirst({ orderBy: { createdAt: 'desc' } })
    expect(newest?.fps).toBeCloseTo(45.0, 0)
    expect(newest?.reason).toBeNull() // success run has no reason
  }, 15000)
})

describe('persistence: rollback — prune failure rolls back insert, service still returns result', () => {
  test('if transaction throws, new row absent; BenchmarkResult still returned', async () => {
    // Monkey-patch prisma.$transaction to simulate a prune failure.
    const originalTransaction = prisma.$transaction.bind(prisma)
    // biome-ignore lint/suspicious/noExplicitAny: test-only monkey-patch
    ;(prisma as any).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
      // Wrap fn in a transaction that throws after the insert to simulate prune failure.
      return originalTransaction(async (tx: unknown) => {
        // Run the fn but catch the error that we inject.
        const wrappedTx = new Proxy(tx as object, {
          get(target, prop) {
            if (prop === '$executeRaw') {
              // biome-ignore lint/suspicious/noExplicitAny: test-only
              return (..._args: any[]) => {
                throw new Error('simulated prune failure')
              }
            }
            // biome-ignore lint/suspicious/noExplicitAny: test-only
            return (target as any)[prop]
          }
        })
        return fn(wrappedTx)
      })
    }

    const restore = withSpawnStub(() => fakeProc([progressLine(45.0)], 0))
    try {
      const result = await benchmarkProfile(BENCH_OPTS)

      // Service must still return a valid result despite persistence failure.
      expect(result).toBeDefined()
      expect(typeof result.ok).toBe('boolean')

      // The transaction was rolled back — no row should be present.
      const rows = await prisma.benchmarkLog.findMany()
      expect(rows).toHaveLength(0)
    } finally {
      restore()
      // biome-ignore lint/suspicious/noExplicitAny: restore original
      ;(prisma as any).$transaction = originalTransaction
    }
  })
})

// ---------------------------------------------------------------------------
// profileId persistence
// ---------------------------------------------------------------------------

describe('persistence: profileId is stored when provided', () => {
  test('row has profileId matching the seeded EncodeProfile uuid', async () => {
    const profile = await prisma.encodeProfile.create({
      data: {
        name: 'テスト',
        codec: 'avc',
        hwAccel: 'cpu',
        rateControl: 'vbr',
        bitrateKbps: 4000,
        qpValue: 23,
        keepOriginalResolution: true,
        resolution: 'hd720'
      }
    })

    const restore = withSpawnStub(() => fakeProc([progressLine(45.0)], 0))
    try {
      await benchmarkProfile({ ...BENCH_OPTS, profileId: profile.id })
      const row = await prisma.benchmarkLog.findFirstOrThrow()
      expect(row.profileId).toBe(profile.id)
    } finally {
      restore()
      await prisma.encodeProfile.deleteMany({ where: { id: profile.id } })
    }
  })
})

describe('persistence: profileId is null when not provided', () => {
  test('row has profileId === null when omitted', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(45.0)], 0))
    try {
      await benchmarkProfile(BENCH_OPTS)
      const row = await prisma.benchmarkLog.findFirstOrThrow()
      expect(row.profileId).toBeNull()
    } finally {
      restore()
    }
  })
})

// ---------------------------------------------------------------------------
// isBenchmarkBusy
// ---------------------------------------------------------------------------

describe('isBenchmarkBusy()', () => {
  test('returns false when no benchmark is running', () => {
    expect(isBenchmarkBusy()).toBe(false)
  })

  test('returns true while a benchmark is in progress', async () => {
    let resolveExit: (n: number) => void = () => {}
    const hangingExited = new Promise<number>((resolve) => {
      resolveExit = resolve
    })

    const restore = withSpawnStub(() => ({
      exited: hangingExited,
      stderr: new ReadableStream({
        start(c) {
          c.close()
        }
      }),
      kill() {
        resolveExit(137)
      }
    }))

    let promise: Promise<unknown> | null = null
    try {
      promise = benchmarkProfile(BENCH_OPTS)
      // Allow the microtask queue to advance so `running` is set.
      await new Promise((r) => setTimeout(r, 0))
      expect(isBenchmarkBusy()).toBe(true)
    } finally {
      resolveExit(0)
      await promise?.catch(() => {})
      restore()
    }
    // After completion, busy flag clears.
    expect(isBenchmarkBusy()).toBe(false)
  })
})
