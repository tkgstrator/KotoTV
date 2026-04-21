import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { app } from '../app'
import { prisma } from '../lib/prisma'
import { BenchmarkResponseSchema } from '../schemas/EncodeProfile.dto'

// ---------------------------------------------------------------------------
// Spawn stubbing — same pattern as encode-benchmark.test.ts.
// We stub Bun.spawn at the process level rather than using mock.module, which
// would contaminate other test files in the same Bun worker.
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

type FakeProc = {
  exited: Promise<number>
  stderr: ReadableStream<Uint8Array>
  kill: (signal?: string) => void
}

function fakeProc(stderrLines: string[], exitCode: number): FakeProc {
  let killed = false
  const stderrStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of stderrLines) {
        if (killed) break
        controller.enqueue(encoder.encode(`${line}\n`))
        await new Promise((r) => setTimeout(r, 0))
      }
      controller.close()
    }
  })

  let resolveExited: (code: number) => void = () => {}
  const exitedPromise = new Promise<number>((resolve) => {
    resolveExited = resolve
  })
  Promise.resolve().then(async () => {
    await new Promise((r) => setTimeout(r, 5))
    resolveExited(exitCode)
  })

  return {
    exited: exitedPromise,
    stderr: stderrStream,
    kill(signal?: string) {
      killed = true
      resolveExited(signal === 'SIGTERM' ? 143 : 137)
    }
  }
}

function progressLine(fps: number): string {
  return `frame=  150 fps= ${fps.toFixed(1)} q=28.0 size=N/A time=00:00:05.00 bitrate=N/A`
}

function withSpawnStub(stub: (...args: unknown[]) => FakeProc): () => void {
  const original = globalThis.Bun.spawn
  // biome-ignore lint/suspicious/noExplicitAny: test-only monkey-patch
  ;(globalThis.Bun as any).spawn = stub
  return () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only monkey-patch
    ;(globalThis.Bun as any).spawn = original
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BODY = {
  codec: 'avc',
  quality: 'low',
  timing: 'immediate',
  hwAccel: 'cpu',
  mode: 'simple',
  rateControl: 'vbr',
  bitrateKbps: 1500,
  qpValue: 23,
  keepOriginalResolution: false,
  resolution: 'sd480'
}

async function seedBenchmarkLog(overrides?: { createdAt?: Date }) {
  return prisma.benchmarkLog.create({
    data: {
      codec: 'avc',
      hwAccel: 'cpu',
      rateControl: 'vbr',
      bitrateKbps: 1500,
      qpValue: 23,
      keepOriginalResolution: false,
      resolution: 'sd480',
      ok: true,
      fps: 42.5,
      wallSeconds: 5.1,
      reason: null,
      ...(overrides?.createdAt ? { createdAt: overrides.createdAt } : {})
    }
  })
}

async function cleanup() {
  await prisma.benchmarkLog.deleteMany()
}

// ---------------------------------------------------------------------------
// POST /api/encode-profiles/benchmark
// ---------------------------------------------------------------------------

describe('POST /api/encode-profiles/benchmark', () => {
  afterEach(async () => {
    await cleanup()
  })

  test('returns 200 with BenchmarkResponse shape when benchmark succeeds', async () => {
    // Stub FFmpeg to emit a healthy fps value and exit 0.
    const restore = withSpawnStub(() => fakeProc([progressLine(45.3)], 0))
    try {
      const res = await app.request('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY)
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      const parsed = BenchmarkResponseSchema.safeParse(body)
      expect(parsed.success).toBe(true)
      expect(body.ok).toBe(true)
    } finally {
      restore()
    }
  })

  test('returns 409 with benchmark_busy message when a benchmark is already running', async () => {
    // Start a hanging benchmark to set isBenchmarkBusy() = true.
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

    // Import benchmarkProfile to start the first (hanging) run.
    const { benchmarkProfile } = await import('../services/encode-benchmark')
    let firstRun: Promise<unknown> | null = null
    try {
      firstRun = benchmarkProfile({
        hwAccel: 'none',
        codec: 'avc',
        rateControl: 'vbr',
        bitrateKbps: 1500,
        qpValue: 23,
        keepOriginalResolution: false,
        resolution: 'sd480'
      })
      // Advance microtasks so `running` is set before the HTTP request.
      await new Promise((r) => setTimeout(r, 0))

      const res = await app.request('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY)
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.message).toBe('benchmark_busy')
    } finally {
      resolveExit(0)
      await firstRun?.catch(() => {})
      restore()
    }
  })

  test('returns 400 when hwAccel has an invalid enum value', async () => {
    // Zod validation rejects the request before benchmarkProfile is called.
    const res = await app.request('/api/encode-profiles/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, hwAccel: 'not-a-valid-accel' })
    })

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// GET /api/encode-profiles/benchmark/history
// ---------------------------------------------------------------------------

describe('GET /api/encode-profiles/benchmark/history', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterEach(async () => {
    await cleanup()
  })

  test('returns 200 with empty items array when table is empty', async () => {
    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ items: [] })
  })

  test('returns 200 with 3 items when 3 rows are seeded', async () => {
    await seedBenchmarkLog()
    await seedBenchmarkLog()
    await seedBenchmarkLog()

    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(3)
  })

  test('returns items ordered by createdAt DESC (newest first)', async () => {
    const now = Date.now()
    // Seed with explicit timestamps spaced 1 s apart so ordering is deterministic.
    await seedBenchmarkLog({ createdAt: new Date(now - 2000) })
    await seedBenchmarkLog({ createdAt: new Date(now - 1000) })
    await seedBenchmarkLog({ createdAt: new Date(now) })

    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(3)

    const timestamps = body.items.map((item: { createdAt: string }) => new Date(item.createdAt).getTime())
    expect(timestamps[0]).toBeGreaterThan(timestamps[1])
    expect(timestamps[1]).toBeGreaterThan(timestamps[2])
  })

  test('returns at most 100 items when 150 rows are seeded', async () => {
    const now = Date.now()
    for (let i = 0; i < 150; i++) {
      await seedBenchmarkLog({ createdAt: new Date(now - i * 1000) })
    }

    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(100)
  })
})
