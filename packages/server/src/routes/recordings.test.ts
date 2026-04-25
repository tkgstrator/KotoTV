import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { addHours, subHours, subMinutes } from 'date-fns'
import { app } from '../app'
import { prisma } from '../lib/prisma'

const TEST_PREFIX = '__test_rec_route__'

async function cleanup() {
  await prisma.recording.deleteMany({
    where: { schedule: { title: { startsWith: TEST_PREFIX } } }
  })
  await prisma.recordingSchedule.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } }
  })
}

describe('/api/recordings', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  test('GET / returns 200 with schedules and recordings arrays', async () => {
    const res = await app.request('/api/recordings')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('schedules')
    expect(body).toHaveProperty('recordings')
    expect(Array.isArray(body.schedules)).toBe(true)
    expect(Array.isArray(body.recordings)).toBe(true)
  })

  test('POST / creates a recording schedule', async () => {
    const channelsRes = await app.request('/api/channels?type=GR')
    const { channels } = await channelsRes.json()
    expect(channels.length).toBeGreaterThan(0)

    const channelId = channels[0].id
    const startAt = addHours(new Date(), 1).toISOString()
    const endAt = addHours(new Date(), 2).toISOString()

    const payload = {
      channelId,
      programId: `test-prog-${Date.now()}`,
      title: `${TEST_PREFIX}create`,
      startAt,
      endAt
    }

    const res = await app.request('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.title).toBe(payload.title)
    expect(body.channelId).toBe(channelId)
    expect(body.status).toBe('pending')
    expect(typeof body.id).toBe('string')
  })

  test('POST / rejects past startAt', async () => {
    const payload = {
      channelId: '12345',
      programId: 'test-past',
      title: `${TEST_PREFIX}past`,
      startAt: subHours(new Date(), 1).toISOString(),
      endAt: subMinutes(new Date(), 30).toISOString()
    }

    const res = await app.request('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(res.status).toBe(400)
  })

  test('DELETE /:scheduleId removes a pending schedule', async () => {
    const startAt = addHours(new Date(), 1).toISOString()
    const endAt = addHours(new Date(), 2).toISOString()

    const createRes = await app.request('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: '12345',
        programId: `test-del-${Date.now()}`,
        title: `${TEST_PREFIX}delete`,
        startAt,
        endAt
      })
    })

    expect(createRes.status).toBe(201)
    const { id } = await createRes.json()

    const deleteRes = await app.request(`/api/recordings/${id}`, {
      method: 'DELETE'
    })

    expect(deleteRes.status).toBe(204)

    const row = await prisma.recordingSchedule.findUnique({ where: { id } })
    expect(row).toBeNull()
  })

  test('DELETE /:scheduleId returns 404 for non-existent schedule', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await app.request(`/api/recordings/${fakeId}`, {
      method: 'DELETE'
    })

    expect(res.status).toBe(404)
  })

  test('GET /:id returns 404 for non-existent recording', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await app.request(`/api/recordings/${fakeId}`)

    expect(res.status).toBe(404)
  })

  test('created schedule appears in GET / list', async () => {
    const startAt = addHours(new Date(), 1).toISOString()
    const endAt = addHours(new Date(), 2).toISOString()

    await app.request('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: '12345',
        programId: `test-list-${Date.now()}`,
        title: `${TEST_PREFIX}list`,
        startAt,
        endAt
      })
    })

    const res = await app.request('/api/recordings')
    const { schedules } = await res.json()

    const found = schedules.find((s: { title: string }) => s.title === `${TEST_PREFIX}list`)
    expect(found).toBeDefined()
    expect(found.status).toBe('pending')
  })
})
