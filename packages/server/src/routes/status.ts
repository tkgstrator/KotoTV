import { statfsSync } from 'node:fs'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../lib/config'
import { getLogTail, pushLogLine } from '../lib/log-buffer'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import type { HealthLogsResponse, HealthResponse } from '../schemas/Health.dto'
import { LogSubsystemParamSchema } from '../schemas/Health.dto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function checkMirakc(): Promise<HealthResponse['mirakc']> {
  try {
    const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/status`, 2000)
    if (res.status === 200) {
      let version = 'unknown'
      try {
        const body = await res.json()
        if (typeof body?.version === 'string') version = body.version
      } catch {
        // version field not critical
      }
      const detail = `mirakc ${version}`
      pushLogLine('mirakc', 'info', detail)
      return { status: 'ok', detail }
    }
    const detail = `mirakc returned HTTP ${res.status}`
    pushLogLine('mirakc', 'error', detail)
    return { status: 'err', detail }
  } catch (err) {
    const detail = 'mirakc unreachable (fallback to mock)'
    pushLogLine('mirakc', 'warn', detail)
    logger.warn({ module: 'health', err }, detail)
    return { status: 'warn', detail }
  }
}

async function checkPostgres(): Promise<HealthResponse['postgres']> {
  try {
    await prisma.$queryRaw`SELECT 1`
    const detail = 'postgres reachable'
    pushLogLine('postgres', 'info', detail)
    return { status: 'ok', detail }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'postgres unreachable'
    pushLogLine('postgres', 'error', detail)
    logger.error({ module: 'health', err }, 'postgres health check failed')
    return { status: 'err', detail }
  }
}

async function checkFfmpeg(): Promise<HealthResponse['ffmpeg']> {
  try {
    const proc = Bun.spawn(['ffmpeg', '-version'], { stdout: 'pipe', stderr: 'pipe' })
    const raw = await new Response(proc.stdout).text()
    await proc.exited
    // First line format: "ffmpeg version 7.x-..."
    const firstLine = raw.split('\n')[0] ?? ''
    const match = firstLine.match(/ffmpeg version (\S+)/)
    const version = match?.[1] ?? firstLine.trim()
    const detail = version ? `ffmpeg ${version}` : 'ffmpeg installed (version unknown)'
    pushLogLine('ffmpeg', 'info', detail)
    return { status: 'ok', detail }
  } catch (err) {
    const detail = 'ffmpeg not found in PATH'
    pushLogLine('ffmpeg', 'error', detail)
    logger.warn({ module: 'health', err }, detail)
    return { status: 'err', detail }
  }
}

async function checkTuners(): Promise<HealthResponse['tuners']> {
  try {
    const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/tuners`, 2000)
    if (!res.ok) {
      const detail = `tuners endpoint returned HTTP ${res.status}`
      pushLogLine('tuners', 'warn', detail)
      return { status: 'warn', detail }
    }
    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      const detail = 'unexpected tuners response shape'
      pushLogLine('tuners', 'warn', detail)
      return { status: 'warn', detail }
    }
    const tuners = data as Array<{ isFree?: boolean }>
    const total = tuners.length
    const free = tuners.filter((t) => t.isFree !== false).length
    const detail = `${free}/${total} free`
    pushLogLine('tuners', 'info', detail)
    return { status: 'ok', detail }
  } catch (err) {
    const detail = 'mirakc unreachable, tuner status unknown'
    pushLogLine('tuners', 'warn', detail)
    logger.warn({ module: 'health', err }, detail)
    return { status: 'warn', detail }
  }
}

async function checkDisk(): Promise<HealthResponse['disk']> {
  const GB = 1024 * 1024 * 1024

  // statvfs on the data directory (HLS_DIR or fallback to cwd)
  let free = 0
  let total = 0
  try {
    const stat = statfsSync(env.HLS_DIR)
    free = stat.bfree * stat.bsize
    total = stat.blocks * stat.bsize
  } catch (err) {
    logger.warn({ module: 'health', err }, 'statfsSync failed, falling back to process cwd')
    try {
      const stat = statfsSync(process.cwd())
      free = stat.bfree * stat.bsize
      total = stat.blocks * stat.bsize
    } catch {
      // leave as 0
    }
  }

  // SUM of recording size from DB
  let recordingsBytes = 0
  try {
    const agg = await prisma.recording.aggregate({ _sum: { sizeBytes: true } })
    recordingsBytes = Number(agg._sum.sizeBytes ?? 0)
  } catch {
    // non-critical
  }

  // HLS tmpfs — we skip directory walk per spec (hlsTmpfs = 0 placeholder)
  const hlsTmpfs = 0

  const freeGB = free / GB
  let status: 'ok' | 'warn' | 'err'
  if (freeGB < 10) {
    status = 'err'
  } else if (freeGB < 50) {
    status = 'warn'
  } else {
    status = 'ok'
  }

  const detail = `${(free / GB).toFixed(1)} GB free of ${(total / GB).toFixed(1)} GB`

  return {
    status,
    detail,
    breakdown: {
      recordings: recordingsBytes,
      hlsTmpfs,
      free,
      total
    }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const statusRoute = new Hono().get('/', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const healthRoute = new Hono()
  .get('/', async (c) => {
    const [mirakc, postgres, ffmpeg, tuners, disk] = await Promise.all([
      checkMirakc(),
      checkPostgres(),
      checkFfmpeg(),
      checkTuners(),
      checkDisk()
    ])

    return c.json({ mirakc, postgres, ffmpeg, tuners, disk } satisfies HealthResponse)
  })
  .get('/logs', zValidator('query', LogSubsystemParamSchema), (c) => {
    const { subsystem } = c.req.valid('query')
    const lines = getLogTail(subsystem)
    return c.json({ lines } satisfies HealthLogsResponse)
  })

export { healthRoute, statusRoute }
