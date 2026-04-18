import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { aribGenreToString } from '../lib/arib-genre'
import { type Program, ProgramListQuerySchema, ProgramListResponseSchema } from '../schemas/Program.dto'
import { mirakcClient } from '../services/mirakc-client'

const programsRoute = new Hono().get('/', zValidator('query', ProgramListQuerySchema), async (c) => {
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

  const programs: Program[] = mirakcPrograms.map((p) => {
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
  })

  const body = ProgramListResponseSchema.parse({ programs }) satisfies typeof ProgramListResponseSchema._type

  return c.json(body)
})

export default programsRoute
