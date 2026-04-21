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

async function seedProfile(name = 'テスト') {
  return prisma.encodeProfile.create({
    data: {
      name,
      codec: 'avc',
      hwAccel: 'cpu',
      rateControl: 'vbr',
      bitrateKbps: 4000,
      qpValue: 23,
      keepOriginalResolution: true,
      resolution: 'hd720'
    }
  })
}

async function seedBenchmarkLog(overrides?: { createdAt?: Date; profileId?: string | null }) {
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
      profileId: overrides?.profileId !== undefined ? overrides.profileId : null,
      ...(overrides?.createdAt ? { createdAt: overrides.createdAt } : {})
    }
  })
}

async function cleanup() {
  await prisma.benchmarkLog.deleteMany()
}

async function cleanupProfiles(ids: string[]) {
  await prisma.encodeProfile.deleteMany({ where: { id: { in: ids } } })
}

// ---------------------------------------------------------------------------
// POST /api/encode-profiles/benchmark
// ---------------------------------------------------------------------------

describe('POST /api/encode-profiles/benchmark', () => {
  afterEach(async () => {
    await cleanup()
  })

  test('returns 200 with BenchmarkResponse shape when benchmark succeeds (with profileId)', async () => {
    const profile = await seedProfile()
    const restore = withSpawnStub(() => fakeProc([progressLine(45.3)], 0))
    try {
      const res = await app.request('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codec: 'avc',
          quality: 'low',
          timing: 'immediate',
          hwAccel: 'cpu',
          mode: 'simple',
          rateControl: 'vbr',
          bitrateKbps: 1500,
          qpValue: 23,
          keepOriginalResolution: false,
          resolution: 'sd480',
          profileId: profile.id
        })
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      const parsed = BenchmarkResponseSchema.safeParse(body)
      expect(parsed.success).toBe(true)
      expect(body.ok).toBe(true)
    } finally {
      restore()
      await cleanupProfiles([profile.id])
    }
  })

  test('returns 200 with BenchmarkResponse shape when no profileId supplied', async () => {
    const restore = withSpawnStub(() => fakeProc([progressLine(45.3)], 0))
    try {
      const res = await app.request('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      const parsed = BenchmarkResponseSchema.safeParse(body)
      expect(parsed.success).toBe(true)
    } finally {
      restore()
    }
  })

  test('returns 409 with benchmark_busy message when a benchmark is already running', async () => {
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
      await new Promise((r) => setTimeout(r, 0))

      const res = await app.request('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
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
    const res = await app.request('/api/encode-profiles/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codec: 'avc',
        quality: 'low',
        timing: 'immediate',
        hwAccel: 'not-a-valid-accel',
        mode: 'simple',
        rateControl: 'vbr',
        bitrateKbps: 1500,
        qpValue: 23,
        keepOriginalResolution: false,
        resolution: 'sd480'
      })
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

  test('returns profileId and profileName derived from JOIN when profile exists', async () => {
    const profile = await seedProfile('テスト')
    await seedBenchmarkLog({ profileId: profile.id })

    try {
      const res = await app.request('/api/encode-profiles/benchmark/history')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].profileId).toBe(profile.id)
      expect(body.items[0].profileName).toBe('テスト')
    } finally {
      await cleanupProfiles([profile.id])
    }
  })

  test('returns null profileId and profileName when no profile linked', async () => {
    await seedBenchmarkLog()

    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].profileId).toBeNull()
    expect(body.items[0].profileName).toBeNull()
  })

  test('SetNull on delete — profile deleted → history row has profileId: null, profileName: null', async () => {
    const profile = await seedProfile('削除テスト')
    await seedBenchmarkLog({ profileId: profile.id })

    // Delete the profile — FK onDelete: SetNull should null out profile_id in bench row.
    await prisma.encodeProfile.delete({ where: { id: profile.id } })

    const res = await app.request('/api/encode-profiles/benchmark/history')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].profileId).toBeNull()
    expect(body.items[0].profileName).toBeNull()
  })

  test('returns 200 with 3 items; mixed profileId values round-trip', async () => {
    const profile = await seedProfile('プロファイルA')
    await seedBenchmarkLog({ profileId: null })
    await seedBenchmarkLog({ profileId: null })
    await seedBenchmarkLog({ profileId: profile.id })

    try {
      const res = await app.request('/api/encode-profiles/benchmark/history')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(3)

      const ids = body.items.map((item: { profileId: string | null }) => item.profileId)
      expect(ids).toContain(null)
      expect(ids).toContain(profile.id)
    } finally {
      await cleanupProfiles([profile.id])
    }
  })

  test('returns items ordered by createdAt DESC (newest first)', async () => {
    const now = Date.now()
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
