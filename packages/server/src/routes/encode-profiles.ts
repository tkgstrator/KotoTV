import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  type BenchmarkHistoryResponse,
  type BenchmarkLog,
  BenchmarkLogSchema,
  BenchmarkRequestSchema,
  type BenchmarkResponse,
  CreateEncodeProfileSchema,
  type EncodeProfile,
  EncodeProfileSchema,
  UpdateEncodeProfileSchema
} from '../schemas/EncodeProfile.dto'
import { benchmarkProfile, isBenchmarkBusy } from '../services/encode-benchmark'

const IdParamSchema = z.object({ id: z.string().uuid() })

function serialize(row: {
  id: string
  name: string
  mode: string
  codec: string
  quality: string
  timing: string
  hwAccel: string
  rateControl: string
  bitrateKbps: number
  qpValue: number
  isDefault: boolean
  keepOriginalResolution: boolean
  resolution: string
  createdAt: Date
  updatedAt: Date
}): EncodeProfile {
  return EncodeProfileSchema.parse({
    id: row.id,
    name: row.name,
    mode: row.mode,
    codec: row.codec,
    quality: row.quality,
    timing: row.timing,
    hwAccel: row.hwAccel,
    rateControl: row.rateControl,
    bitrateKbps: row.bitrateKbps,
    qpValue: row.qpValue,
    isDefault: row.isDefault,
    keepOriginalResolution: row.keepOriginalResolution,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  })
}

// When the caller sets isDefault=true, clear the flag on every other row so
// "default" is always a single profile.
async function promoteAsDefault(id: string): Promise<void> {
  await prisma.encodeProfile.updateMany({
    where: { id: { not: id }, isDefault: true },
    data: { isDefault: false }
  })
}

/**
 * Seed a CPU-backed default profile on boot if the table is empty. Keeps the
 * settings UI and rule picker from ever landing on a zero-profile state where
 * the user couldn't attach encoding to anything without first making a
 * profile.
 */
export async function ensureDefaultEncodeProfile(): Promise<void> {
  const count = await prisma.encodeProfile.count()
  if (count > 0) return
  await prisma.encodeProfile.create({
    data: {
      name: '標準 (CPU / AVC)',
      codec: 'avc',
      quality: 'medium',
      timing: 'immediate',
      hwAccel: 'cpu',
      isDefault: true
    }
  })
}

function serializeBenchmarkLog(row: {
  id: string
  createdAt: Date
  profileId: string | null
  profile: { name: string } | null
  codec: string
  hwAccel: string
  rateControl: string
  bitrateKbps: number
  qpValue: number
  keepOriginalResolution: boolean
  resolution: string
  ok: boolean
  fps: number
  wallSeconds: number
  reason: string | null
}): BenchmarkLog {
  return BenchmarkLogSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    profileId: row.profileId,
    profileName: row.profile?.name ?? null
  })
}

const encodeProfilesRoute = new Hono()
  .get('/', async (c) => {
    const rows = await prisma.encodeProfile.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })
    return c.json({ profiles: rows.map(serialize) })
  })

  .post('/', zValidator('json', CreateEncodeProfileSchema), async (c) => {
    const body = c.req.valid('json')
    const row = await prisma.encodeProfile.create({
      data: {
        name: body.name,
        mode: body.mode,
        codec: body.codec,
        quality: body.quality,
        timing: body.timing,
        hwAccel: body.hwAccel,
        rateControl: body.rateControl,
        bitrateKbps: body.bitrateKbps,
        qpValue: body.qpValue,
        isDefault: body.isDefault,
        keepOriginalResolution: body.keepOriginalResolution,
        resolution: body.resolution
      }
    })
    if (row.isDefault) await promoteAsDefault(row.id)
    return c.json(serialize(row), 201)
  })

  // /benchmark and /benchmark/history must be declared BEFORE /:id — otherwise
  // Hono would match the literal string 'benchmark' as the :id param and reject it.
  .post('/benchmark', zValidator('json', BenchmarkRequestSchema), async (c) => {
    const body = c.req.valid('json')
    if (isBenchmarkBusy()) {
      throw new HTTPException(409, { message: 'benchmark_busy' })
    }
    // Map DB hwAccel ('cpu') to the FFmpeg hwAccel type ('none').
    const ffmpegHwAccel = body.hwAccel === 'cpu' ? 'none' : body.hwAccel
    try {
      const result = await benchmarkProfile({
        hwAccel: ffmpegHwAccel,
        codec: body.codec as 'avc' | 'hevc',
        rateControl: body.rateControl,
        bitrateKbps: body.bitrateKbps,
        qpValue: body.qpValue,
        keepOriginalResolution: body.keepOriginalResolution,
        resolution: body.resolution,
        ...(body.profileId !== undefined ? { profileId: body.profileId } : {})
      })
      return c.json(result satisfies BenchmarkResponse)
    } catch (err) {
      if (err instanceof Error && err.message === 'benchmark_busy') {
        throw new HTTPException(409, { message: 'benchmark_busy' })
      }
      throw err
    }
  })

  .get('/benchmark/history', async (c) => {
    const rows = await prisma.benchmarkLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { profile: { select: { name: true } } }
    })
    return c.json({ items: rows.map(serializeBenchmarkLog) } satisfies BenchmarkHistoryResponse)
  })

  .delete('/benchmark/history', async (c) => {
    await prisma.benchmarkLog.deleteMany()
    return new Response(null, { status: 204 })
  })

  .get('/:id', zValidator('param', IdParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const row = await prisma.encodeProfile.findUnique({ where: { id } })
    if (!row) throw new HTTPException(404, { message: 'encode profile not found' })
    return c.json(serialize(row))
  })

  .patch('/:id', zValidator('param', IdParamSchema), zValidator('json', UpdateEncodeProfileSchema), async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    const existing = await prisma.encodeProfile.findUnique({ where: { id } })
    if (!existing) throw new HTTPException(404, { message: 'encode profile not found' })

    const row = await prisma.encodeProfile.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.codec !== undefined ? { codec: body.codec } : {}),
        ...(body.quality !== undefined ? { quality: body.quality } : {}),
        ...(body.timing !== undefined ? { timing: body.timing } : {}),
        ...(body.hwAccel !== undefined ? { hwAccel: body.hwAccel } : {}),
        ...(body.rateControl !== undefined ? { rateControl: body.rateControl } : {}),
        ...(body.bitrateKbps !== undefined ? { bitrateKbps: body.bitrateKbps } : {}),
        ...(body.qpValue !== undefined ? { qpValue: body.qpValue } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.keepOriginalResolution !== undefined ? { keepOriginalResolution: body.keepOriginalResolution } : {}),
        ...(body.resolution !== undefined ? { resolution: body.resolution } : {})
      }
    })
    if (row.isDefault) await promoteAsDefault(row.id)
    return c.json(serialize(row))
  })

  .delete('/:id', zValidator('param', IdParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const existing = await prisma.encodeProfile.findUnique({ where: { id } })
    if (!existing) throw new HTTPException(404, { message: 'encode profile not found' })
    if (existing.isDefault) {
      throw new HTTPException(400, {
        message: 'default profile cannot be deleted — mark another profile as default first'
      })
    }
    const total = await prisma.encodeProfile.count()
    if (total <= 1) {
      throw new HTTPException(400, { message: 'at least one encode profile must remain' })
    }
    // onDelete: SetNull on rule.encodeProfileId / schedule.encodeProfileId
    await prisma.encodeProfile.delete({ where: { id } })
    return new Response(null, { status: 204 })
  })

export default encodeProfilesRoute
