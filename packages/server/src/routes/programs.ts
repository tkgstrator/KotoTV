import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { aribGenreToString } from '../lib/arib-genre'
import type { MirakcProgram } from '../schemas/Channel.dto'
import {
  type Program,
  ProgramGridQuerySchema,
  ProgramGridResponseSchema,
  ProgramListQuerySchema,
  ProgramListResponseSchema
} from '../schemas/Program.dto'
import { mirakcClient } from '../services/mirakc-client'

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

const programsRoute = new Hono()
  .get('/', zValidator('query', ProgramListQuerySchema), async (c) => {
    const { channelId, startAt: startAtStr, endAt: endAtStr } = c.req.valid('query')

    const startAt = new Date(startAtStr)
    const endAt = new Date(endAtStr)

    if (endAt <= startAt) {
      throw new HTTPException(400, { message: 'endAt must be after startAt' })
    }

    const now = Date.now()

    let mirakcPrograms: Awaited<ReturnType<typeof mirakcClient.listProgramsInRange>>
    try {
      mirakcPrograms = await mirakcClient.listProgramsInRange({ channelId, startAt, endAt })
    } catch (_err) {
      throw new HTTPException(502, { message: 'mirakc unavailable' })
    }

    const programs: Program[] = mirakcPrograms.map((p) => toProgram(p, channelId, now))

    const body = ProgramListResponseSchema.parse({ programs }) satisfies typeof ProgramListResponseSchema._type

    return c.json(body)
  })
  .get('/grid', zValidator('query', ProgramGridQuerySchema), async (c) => {
    const { startAt: startAtStr, endAt: endAtStr } = c.req.valid('query')

    const startAt = new Date(startAtStr)
    const endAt = new Date(endAtStr)

    if (endAt <= startAt) {
      throw new HTTPException(400, { message: 'endAt must be after startAt' })
    }

    const startMs = startAt.getTime()
    const endMs = endAt.getTime()
    const now = Date.now()

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

    const result: Record<string, Program[]> = {}

    for (const [mirakurunId, programs] of allByServiceId) {
      const channelId = String(mirakurunId)

      const filtered = programs
        .filter((p) => {
          const programEnd = p.startAt + p.duration
          return p.startAt < endMs && programEnd > startMs
        })
        .sort((a, b) => a.startAt - b.startAt)
        .map((p) => toProgram(p, channelId, now))

      if (filtered.length > 0) {
        result[channelId] = filtered
      }
    }

    const body = ProgramGridResponseSchema.parse({ programs: result }) satisfies typeof ProgramGridResponseSchema._type

    return c.json(body)
  })

export default programsRoute
