import { statfsSync } from 'node:fs'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../lib/config'
import { getLogTail } from '../lib/log-buffer'
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
    // mirakc exposes its build metadata under /api/version; /api/status is
    // a legacy alias on some builds. Try both so this works across versions.
    const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/version`, 2000)
    if (res.status === 200) {
      let version: string | null = null
      try {
        const body = (await res.json()) as { current?: unknown; latest?: unknown; version?: unknown }
        if (typeof body.current === 'string') version = body.current
        else if (typeof body.version === 'string') version = body.version
      } catch {
        // version field not critical
      }
      const detail = version ? `mirakc ${version}` : 'mirakc reachable'
      return { status: 'ok', detail, version }
    }
    const detail = `mirakc returned HTTP ${res.status}`
    logger.error({ module: 'mirakc' }, detail)
    return { status: 'err', detail, version: null }
  } catch (err) {
    const detail = 'mirakc unreachable (fallback to mock)'
    logger.warn({ module: 'mirakc', err }, detail)
    return { status: 'warn', detail, version: null }
  }
}

async function checkPostgres(): Promise<HealthResponse['postgres']> {
  try {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`
    const raw = rows[0]?.version ?? ''
    // `SELECT version()` returns e.g. "PostgreSQL 17.2 (Debian 17.2-1) on
    // x86_64-pc-linux-gnu". Trim to the leading product + version for UI.
    const match = raw.match(/^PostgreSQL\s+([0-9][^\s,()]*)/i)
    const version = match ? `PostgreSQL ${match[1]}` : raw ? raw.split(' ').slice(0, 2).join(' ') : null
    const detail = version ?? 'postgres reachable'
    return { status: 'ok', detail, version }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'postgres unreachable'
    logger.error({ module: 'postgres', err }, 'postgres health check failed')
    return { status: 'err', detail, version: null }
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
    return { status: 'ok', detail }
  } catch (err) {
    const detail = 'ffmpeg not found in PATH'
    logger.error({ module: 'ffmpeg', err }, detail)
    return { status: 'err', detail }
  }
}

interface MirakcTuner {
  name?: unknown
  types?: unknown
  command?: unknown
  isFree?: unknown
}

function normalizeTuner(raw: MirakcTuner): HealthResponse['tuners']['devices'][number] {
  const name = typeof raw.name === 'string' ? raw.name : 'unknown'
  const types = Array.isArray(raw.types) ? raw.types.filter((t): t is string => typeof t === 'string') : []
  // mirakc's `command` template includes the recording binary (recdvb,
  // recpt1, dvbv5-zap, ...) — surfacing it gives a useful hint about the
  // underlying hardware without having to parse lsusb.
  const command = typeof raw.command === 'string' ? raw.command : null
  const isFree = raw.isFree !== false
  return { name, types, command, isFree }
}

async function checkTuners(): Promise<HealthResponse['tuners']> {
  try {
    const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/tuners`, 2000)
    if (!res.ok) {
      const detail = `tuners endpoint returned HTTP ${res.status}`
      logger.warn({ module: 'tuners' }, detail)
      return { status: 'warn', detail, devices: [] }
    }
    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      const detail = 'unexpected tuners response shape'
      logger.warn({ module: 'tuners' }, detail)
      return { status: 'warn', detail, devices: [] }
    }
    const devices = (data as MirakcTuner[]).map(normalizeTuner)
    const total = devices.length
    const free = devices.filter((t) => t.isFree).length
    const detail = `${free}/${total} free`
    return { status: 'ok', detail, devices }
  } catch (err) {
    const detail = 'mirakc unreachable, tuner status unknown'
    logger.warn({ module: 'tuners', err }, detail)
    return { status: 'warn', detail, devices: [] }
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
    const runtime: HealthResponse['runtime'] =
      typeof Bun !== 'undefined'
        ? { name: 'Bun', version: Bun.version }
        : { name: 'Node', version: process.versions.node }

    return c.json({ mirakc, postgres, ffmpeg, tuners, disk, runtime } satisfies HealthResponse)
  })
  .get('/logs', zValidator('query', LogSubsystemParamSchema), (c) => {
    const { subsystem } = c.req.valid('query')
    const lines = getLogTail(subsystem)
    return c.json({ lines } satisfies HealthLogsResponse)
  })

export { healthRoute, statusRoute }
