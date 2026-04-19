import { afterEach, describe, expect, test } from 'bun:test'
import { HTTPException } from 'hono/http-exception'
import { prisma } from '../lib/prisma'
import { resolveRecordingFile } from './recording-service'

const SCHEDULE_ID_MARKER = 'rec-svc-test'

afterEach(async () => {
  await prisma.recording.deleteMany({ where: { scheduleId: { contains: SCHEDULE_ID_MARKER } } })
  await prisma.recordingSchedule.deleteMany({ where: { id: { contains: SCHEDULE_ID_MARKER } } })
})

async function seedSchedule(suffix: string) {
  return prisma.recordingSchedule.create({
    data: {
      id: `${SCHEDULE_ID_MARKER}-${suffix}`,
      channelId: 'ch-1',
      programId: 'prog-1',
      title: 'test',
      startAt: new Date(),
      endAt: new Date(Date.now() + 60_000),
      status: 'completed'
    }
  })
}

describe('resolveRecordingFile', () => {
  test('returns { id, filePath, durationSec } when row + file exist', async () => {
    const sch = await seedSchedule('ok')
    const rec = await prisma.recording.create({
      data: {
        scheduleId: sch.id,
        channelId: 'ch-1',
        title: 'test',
        startedAt: new Date(),
        endedAt: new Date(),
        filePath: '/tmp/test.ts',
        sizeBytes: 1024n,
        durationSec: 60,
        status: 'completed'
      }
    })

    const resolved = await resolveRecordingFile(rec.id)
    expect(resolved).toEqual({ id: rec.id, filePath: '/tmp/test.ts', durationSec: 60 })
  })

  test('throws 404 when id does not match any row', async () => {
    try {
      await resolveRecordingFile('00000000-0000-0000-0000-000000000000')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      expect((e as HTTPException).status).toBe(404)
    }
  })

  test('throws 409 when the recording has no filePath (still in flight)', async () => {
    const sch = await seedSchedule('in-flight')
    const rec = await prisma.recording.create({
      data: {
        scheduleId: sch.id,
        channelId: 'ch-1',
        title: 'test',
        startedAt: new Date(),
        filePath: null,
        status: 'recording'
      }
    })

    try {
      await resolveRecordingFile(rec.id)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      expect((e as HTTPException).status).toBe(409)
    }
  })
})
