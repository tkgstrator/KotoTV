import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { aribGenreToString } from '../lib/arib-genre'
import type { MirakcProgram } from '../schemas/Channel.dto'
import { type Program, ProgramListQuerySchema, ProgramListResponseSchema } from '../schemas/Program.dto'
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

const programsRoute = new Hono().get('/', zValidator('query', ProgramListQuerySchema), async (c) => {
  const { channelId, startAt: startAtStr, endAt: endAtStr } = c.req.valid('query')

  const startAt = new Date(startAtStr)
  const endAt = new Date(endAtStr)

  if (endAt <= startAt) {
    throw new HTTPException(400, { message: 'endAt must be after startAt' })
  }

  const startMs = startAt.getTime()
  const endMs = endAt.getTime()
  const now = Date.now()

  let programs: Program[]

  if (channelId !== undefined) {
    let mirakcPrograms: MirakcProgram[]
    try {
      mirakcPrograms = await mirakcClient.listProgramsInRange({ channelId, startAt, endAt })
    } catch (_err) {
      throw new HTTPException(502, { message: 'mirakc unavailable' })
    }
    programs = mirakcPrograms.map((p) => toProgram(p, channelId, now))
  } else {
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

    programs = []
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
  }

  const body = ProgramListResponseSchema.parse({ programs }) satisfies typeof ProgramListResponseSchema._type

  return c.json(body)
})

export default programsRoute
