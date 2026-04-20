import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import {
  CreateRecordingRuleSchema,
  PreviewRecordingRuleRequestSchema,
  PreviewRecordingRuleResponseSchema,
  type RecordingRule,
  RecordingRuleSchema,
  UpdateRecordingRuleSchema
} from '../schemas/RecordingRule.dto'
import { matches, runRuleMatcher } from '../services/rule-matcher'

const IdParamSchema = z.object({ id: z.string().uuid() })

function validateRegexKeyword(keyword: string | null | undefined, mode: string | undefined): void {
  if (mode === 'regex' && keyword) {
    try {
      new RegExp(keyword)
    } catch {
      throw new HTTPException(400, { message: 'invalid regex pattern' })
    }
  }
}

function serializeRule(row: {
  id: string
  name: string
  enabled: boolean
  keyword: string | null
  keywordMode: string
  keywordTarget: string
  excludeKeyword: string | null
  channelIds: string[]
  genres: string[]
  dayOfWeek: number[]
  timeStartMinutes: number | null
  timeEndMinutes: number | null
  priority: number
  avoidDuplicates: boolean
  excludeReruns: boolean
  newOnly: boolean
  marginStartMinutes: number
  marginEndMinutes: number
  minDurationMinutes: number
  keepLatestN: number
  encodeProfileId: string | null
  createdAt: Date
  updatedAt: Date
}): RecordingRule {
  return RecordingRuleSchema.parse({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    keyword: row.keyword,
    keywordMode: row.keywordMode,
    keywordTarget: row.keywordTarget,
    excludeKeyword: row.excludeKeyword,
    channelIds: row.channelIds,
    genres: row.genres,
    dayOfWeek: row.dayOfWeek,
    timeStartMinutes: row.timeStartMinutes,
    timeEndMinutes: row.timeEndMinutes,
    priority: row.priority,
    avoidDuplicates: row.avoidDuplicates,
    excludeReruns: row.excludeReruns,
    newOnly: row.newOnly,
    marginStartMinutes: row.marginStartMinutes,
    marginEndMinutes: row.marginEndMinutes,
    minDurationMinutes: row.minDurationMinutes,
    keepLatestN: row.keepLatestN,
    encodeProfileId: row.encodeProfileId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  })
}

const recordingRulesRoute = new Hono()
  // GET /api/recording-rules
  .get('/', async (c) => {
    const rows = await prisma.recordingRule.findMany({ orderBy: { createdAt: 'desc' } })
    return c.json({ rules: rows.map(serializeRule) })
  })

  // POST /api/recording-rules/preview — must be before /:id to avoid param conflict
  .post('/preview', zValidator('json', PreviewRecordingRuleRequestSchema), async (c) => {
    const body = c.req.valid('json')

    validateRegexKeyword(body.keyword, body.keywordMode)

    const windowMs = (body.windowHours ?? 24) * 60 * 60 * 1000
    const since = new Date()
    const until = new Date(Date.now() + windowMs)
    const limit = body.limit ?? 50

    const ruleForMatch = {
      id: 'preview',
      enabled: true,
      keyword: body.keyword ?? null,
      keywordMode: body.keywordMode ?? 'literal',
      keywordTarget: body.keywordTarget ?? 'title',
      excludeKeyword: body.excludeKeyword ?? null,
      channelIds: body.channelIds ?? [],
      genres: body.genres ?? [],
      dayOfWeek: body.dayOfWeek ?? [],
      timeStartMinutes: body.timeStartMinutes ?? null,
      timeEndMinutes: body.timeEndMinutes ?? null,
      priority: body.priority ?? 0,
      avoidDuplicates: body.avoidDuplicates ?? true
    }

    const programs = await prisma.program.findMany({
      where: {
        startAt: { lt: until },
        endAt: { gt: since },
        ...(ruleForMatch.channelIds.length > 0 ? { channelId: { in: ruleForMatch.channelIds } } : {}),
        ...(ruleForMatch.genres.length > 0 ? { genres: { hasSome: ruleForMatch.genres } } : {}),
        ...(ruleForMatch.keywordMode === 'literal' && ruleForMatch.keyword
          ? { title: { contains: ruleForMatch.keyword, mode: 'insensitive' } }
          : {})
      }
    })

    const matched = programs.filter((p) => matches(p, ruleForMatch))
    const limited = matched.slice(0, limit)

    const body2 = PreviewRecordingRuleResponseSchema.parse({
      matchCount: matched.length,
      programs: limited.map((p) => ({
        id: p.id,
        channelId: p.channelId,
        title: p.title,
        startAt: p.startAt.toISOString(),
        endAt: p.endAt.toISOString()
      }))
    })

    return c.json(body2)
  })

  // POST /api/recording-rules
  .post('/', zValidator('json', CreateRecordingRuleSchema), async (c) => {
    const body = c.req.valid('json')

    validateRegexKeyword(body.keyword, body.keywordMode)

    const row = await prisma.recordingRule.create({
      data: {
        name: body.name,
        enabled: body.enabled ?? true,
        keyword: body.keyword ?? null,
        keywordMode: (body.keywordMode ?? 'literal') as 'literal' | 'regex',
        keywordTarget: (body.keywordTarget ?? 'title') as 'title' | 'title_description',
        excludeKeyword: body.excludeKeyword ?? null,
        channelIds: body.channelIds ?? [],
        genres: body.genres ?? [],
        dayOfWeek: body.dayOfWeek ?? [],
        timeStartMinutes: body.timeStartMinutes ?? null,
        timeEndMinutes: body.timeEndMinutes ?? null,
        priority: body.priority ?? 0,
        avoidDuplicates: body.avoidDuplicates ?? true,
        excludeReruns: body.excludeReruns,
        newOnly: body.newOnly,
        marginStartMinutes: body.marginStartMinutes,
        marginEndMinutes: body.marginEndMinutes,
        minDurationMinutes: body.minDurationMinutes,
        keepLatestN: body.keepLatestN,
        encodeProfileId: body.encodeProfileId
      }
    })

    const rule = serializeRule(row)

    // Fire-and-forget: run matcher for this new rule immediately
    runRuleMatcher({ ruleIds: [row.id] }).catch((err) => {
      logger.warn({ module: 'recording-rules', ruleId: row.id, err }, 'post-create matcher failed')
    })

    return c.json(rule, 201)
  })

  // GET /api/recording-rules/:id
  .get('/:id', zValidator('param', IdParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const row = await prisma.recordingRule.findUnique({ where: { id } })
    if (!row) throw new HTTPException(404, { message: 'recording rule not found' })
    return c.json(serializeRule(row))
  })

  // PATCH /api/recording-rules/:id
  .patch('/:id', zValidator('param', IdParamSchema), zValidator('json', UpdateRecordingRuleSchema), async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    const existing = await prisma.recordingRule.findUnique({ where: { id } })
    if (!existing) throw new HTTPException(404, { message: 'recording rule not found' })

    const nextKeyword = 'keyword' in body ? body.keyword : existing.keyword
    const nextMode = body.keywordMode ?? existing.keywordMode
    validateRegexKeyword(nextKeyword, nextMode)

    const row = await prisma.recordingRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...('keyword' in body ? { keyword: body.keyword ?? null } : {}),
        ...(body.keywordMode !== undefined ? { keywordMode: body.keywordMode as 'literal' | 'regex' } : {}),
        ...(body.keywordTarget !== undefined
          ? { keywordTarget: body.keywordTarget as 'title' | 'title_description' }
          : {}),
        ...('excludeKeyword' in body ? { excludeKeyword: body.excludeKeyword ?? null } : {}),
        ...(body.channelIds !== undefined ? { channelIds: body.channelIds } : {}),
        ...(body.genres !== undefined ? { genres: body.genres } : {}),
        ...(body.dayOfWeek !== undefined ? { dayOfWeek: body.dayOfWeek } : {}),
        ...('timeStartMinutes' in body ? { timeStartMinutes: body.timeStartMinutes ?? null } : {}),
        ...('timeEndMinutes' in body ? { timeEndMinutes: body.timeEndMinutes ?? null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.avoidDuplicates !== undefined ? { avoidDuplicates: body.avoidDuplicates } : {}),
        ...(body.excludeReruns !== undefined ? { excludeReruns: body.excludeReruns } : {}),
        ...(body.newOnly !== undefined ? { newOnly: body.newOnly } : {}),
        ...(body.marginStartMinutes !== undefined ? { marginStartMinutes: body.marginStartMinutes } : {}),
        ...(body.marginEndMinutes !== undefined ? { marginEndMinutes: body.marginEndMinutes } : {}),
        ...(body.minDurationMinutes !== undefined ? { minDurationMinutes: body.minDurationMinutes } : {}),
        ...(body.keepLatestN !== undefined ? { keepLatestN: body.keepLatestN } : {}),
        ...('encodeProfileId' in body ? { encodeProfileId: body.encodeProfileId ?? null } : {})
      }
    })

    const rule = serializeRule(row)

    // Fire-and-forget: re-run matcher for updated rule
    runRuleMatcher({ ruleIds: [id] }).catch((err) => {
      logger.warn({ module: 'recording-rules', ruleId: id, err }, 'post-update matcher failed')
    })

    return c.json(rule)
  })

  // DELETE /api/recording-rules/:id
  .delete('/:id', zValidator('param', IdParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const existing = await prisma.recordingRule.findUnique({ where: { id } })
    if (!existing) throw new HTTPException(404, { message: 'recording rule not found' })

    // onDelete: SetNull on RecordingSchedule.ruleId is handled by Prisma/Postgres
    await prisma.recordingRule.delete({ where: { id } })

    return new Response(null, { status: 204 })
  })

export default recordingRulesRoute
