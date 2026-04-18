import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  CreateRecordingScheduleSchema,
  type Recording,
  type RecordingEvent,
  RecordingListResponseSchema,
  type RecordingSchedule,
  RecordingScheduleSchema
} from '../schemas/Recording.dto'

// Module-level subscriber set; streaming layer calls emitRecordingEvent after importing
const subscribers = new Set<(event: RecordingEvent) => void>()

export function emitRecordingEvent(event: RecordingEvent): void {
  for (const fn of subscribers) {
    fn(event)
  }
}

const ScheduleParamSchema = z.object({
  scheduleId: z.string().uuid()
})

function serializeSchedule(row: {
  id: string
  channelId: string
  programId: string
  title: string
  startAt: Date
  endAt: Date
  status: string
  createdAt: Date
  updatedAt: Date
}): RecordingSchedule {
  return RecordingScheduleSchema.parse({
    id: row.id,
    channelId: row.channelId,
    programId: row.programId,
    title: row.title,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  })
}

function serializeRecording(row: {
  id: string
  scheduleId: string
  channelId: string
  title: string
  startedAt: Date
  endedAt: Date | null
  filePath: string | null
  sizeBytes: bigint | null
  durationSec: number | null
  thumbnailUrl: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}): Recording {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    channelId: row.channelId,
    title: row.title,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    filePath: row.filePath,
    // BigInt -> number is safe for file sizes within JS Number range (~8 PB)
    sizeBytes: row.sizeBytes !== null ? Number(row.sizeBytes) : null,
    durationSec: row.durationSec,
    thumbnailUrl: row.thumbnailUrl,
    status: row.status as Recording['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

const recordingsRoute = new Hono()
  .get('/', async (c) => {
    const [schedules, recordings] = await Promise.all([
      prisma.recordingSchedule.findMany({ orderBy: { startAt: 'asc' } }),
      prisma.recording.findMany({ orderBy: { startedAt: 'desc' } })
    ])

    const body = RecordingListResponseSchema.parse({
      schedules: schedules.map(serializeSchedule),
      recordings: recordings.map(serializeRecording)
    })

    return c.json(body)
  })
  .post('/', zValidator('json', CreateRecordingScheduleSchema), async (c) => {
    const data = c.req.valid('json')

    if (new Date(data.startAt) < new Date()) {
      throw new HTTPException(400, { message: 'startAt must be in the future' })
    }

    // TODO(mirakc): verify program exists via mirakcClient.getProgram(data.programId) once Mirakc is online

    let schedule: RecordingSchedule
    try {
      const row = await prisma.recordingSchedule.create({
        data: {
          channelId: data.channelId,
          programId: data.programId,
          title: data.title,
          startAt: new Date(data.startAt),
          endAt: new Date(data.endAt)
        }
      })
      schedule = serializeSchedule(row)
    } catch (err) {
      const e = err as { code?: string }
      if (e.code === 'P2002') {
        throw new HTTPException(409, { message: 'schedule already exists' })
      }
      throw err
    }

    return c.json(schedule, 201)
  })
  .delete('/:scheduleId', zValidator('param', ScheduleParamSchema), async (c) => {
    const { scheduleId } = c.req.valid('param')

    const existing = await prisma.recordingSchedule.findUnique({ where: { id: scheduleId } })
    if (!existing) {
      throw new HTTPException(404, { message: 'schedule not found' })
    }
    if (existing.status !== 'pending') {
      throw new HTTPException(409, { message: `cannot delete schedule in status '${existing.status}'` })
    }

    await prisma.recordingSchedule.delete({ where: { id: scheduleId } })

    return new Response(null, { status: 204 })
  })
  .get('/events', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        const send = (data: string) => {
          controller.enqueue(encoder.encode(data))
        }

        // Send initial heartbeat immediately so the client knows the connection is live
        send(': ping\n\n')

        const heartbeat = setInterval(() => {
          send(': ping\n\n')
        }, 20_000)

        const subscriber = (event: RecordingEvent) => {
          send(`data: ${JSON.stringify(event)}\n\n`)
        }

        subscribers.add(subscriber)

        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(heartbeat)
          subscribers.delete(subscriber)
          controller.close()
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  })

export default recordingsRoute
