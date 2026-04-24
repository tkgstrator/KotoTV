import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { aribGenreToString } from '../lib/arib-genre'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import type { MirakcProgram } from '../schemas/Channel.dto'
import { type Program, ProgramListQuerySchema, ProgramListResponseSchema } from '../schemas/Program.dto'
import { mirakcClient } from '../services/mirakc-client'

const STALE_THRESHOLD_MS = 5 * 60 * 1000

function toProgram(p: MirakcProgram, channelId: string, now: number): Program {
  const endMs = p.startAt + p.duration
  const genres = (p.genres ?? []).map((g) => aribGenreToString(g.lv1, g.lv2))
  // Deduplicate consecutive identical genre labels
  const uniqueGenres = [...new Set(genres)]

  return {
    id: String(p.id),
    channelId,
    title: p.name ?? '(無題)',
    description: p.description,
    startAt: new Date(p.startAt).toISOString(),
    endAt: new Date(endMs).toISOString(),
    genres: uniqueGenres,
    isRecordable: p.startAt > now
  }
}

async function fetchFromMirakc(params: {
  channelId?: string
  startAt: Date
  endAt: Date
  now: number
}): Promise<Program[]> {
  const { channelId, startAt, endAt, now } = params
  const startMs = startAt.getTime()
  const endMs = endAt.getTime()

  if (channelId !== undefined) {
    let mirakcPrograms: MirakcProgram[]
    try {
      mirakcPrograms = await mirakcClient.listProgramsInRange({ channelId, startAt, endAt })
    } catch (_err) {
      throw new HTTPException(502, { message: 'mirakc unavailable' })
    }
    return mirakcPrograms.map((p) => toProgram(p, channelId, now))
  }

  let allByServiceId: Map<number, MirakcProgram[]>
  try {
    allByServiceId = await mirakcClient.listAllProgramsByServiceId()
    // listAllProgramsByServiceId swallows errors and returns an empty map —
    // treat an empty map as a mirakc failure to surface 502 instead of silent empty response
    if (allByServiceId.size === 0) {
      throw new Error('empty map')
    }
  } catch (_err) {
    throw new HTTPException(502, { message: 'mirakc unavailable' })
  }

  const programs: Program[] = []
  for (const [mirakurunId, servicePrograms] of allByServiceId) {
    const cid = String(mirakurunId)
    for (const p of servicePrograms) {
      const programEnd = p.startAt + p.duration
      if (p.startAt < endMs && programEnd > startMs) {
        programs.push(toProgram(p, cid, now))
      }
    }
  }

  // Sort ascending by startAt, then channelId for deterministic order
  programs.sort((a, b) => {
    const tDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    if (tDiff !== 0) return tDiff
    return a.channelId < b.channelId ? -1 : a.channelId > b.channelId ? 1 : 0
  })

  return programs
}

const programsRoute = new Hono().get('/', zValidator('query', ProgramListQuerySchema), async (c) => {
  const { channelId, startAt: startAtStr, endAt: endAtStr } = c.req.valid('query')

  const startAt = new Date(startAtStr)
  const endAt = new Date(endAtStr)

  if (endAt <= startAt) {
    throw new HTTPException(400, { message: 'endAt must be after startAt' })
  }

  const now = Date.now()

  // Primary path: query DB
  const dbRows = await prisma.program.findMany({
    where: {
      ...(channelId !== undefined ? { channelId } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt }
    },
    orderBy: { startAt: 'asc' }
  })

  if (dbRows.length > 0) {
    const programs: Program[] = dbRows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      title: row.title,
      description: row.description ?? undefined,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      genres: row.genres,
      isRecordable: row.startAt > new Date()
    }))

    const body = ProgramListResponseSchema.parse({ programs }) satisfies typeof ProgramListResponseSchema._type
    return c.json(body)
  }

  // Fallback: DB is empty for this range — check if data is stale before hitting Mirakc
  const newest = await prisma.program.findFirst({
    where: channelId !== undefined ? { channelId } : {},
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true }
  })

  const isStale = newest === null || Date.now() - newest.fetchedAt.getTime() > STALE_THRESHOLD_MS

  if (!isStale) {
    // DB is fresh but genuinely has no programs in this window — return empty
    const body = ProgramListResponseSchema.parse({ programs: [] }) satisfies typeof ProgramListResponseSchema._type
    return c.json(body)
  }

  logger.info(
    { module: 'programs-route', channelId, startAt: startAtStr, endAt: endAtStr },
    'DB empty/stale, falling back to Mirakc'
  )

  const programs = await fetchFromMirakc({
    ...(channelId !== undefined ? { channelId } : {}),
    startAt,
    endAt,
    now
  })
  const body = ProgramListResponseSchema.parse({ programs }) satisfies typeof ProgramListResponseSchema._type
  return c.json(body)
})

export default programsRoute
