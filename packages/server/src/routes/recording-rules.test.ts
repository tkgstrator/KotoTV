import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { app } from '../app'
import { prisma } from '../lib/prisma'

const RULE_NAME_PREFIX = '__test_rr_route__'

async function cleanup() {
  await prisma.recordingSchedule.deleteMany({
    where: { rule: { name: { startsWith: RULE_NAME_PREFIX } } }
  })
  await prisma.recordingRule.deleteMany({
    where: { name: { startsWith: RULE_NAME_PREFIX } }
  })
}

async function cleanupPrograms() {
  await prisma.program.deleteMany({
    where: { id: { startsWith: 'test-preview-prog-' } }
  })
}

describe('/api/recording-rules', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    await cleanupPrograms()
  })

  // ---------------------------------------------------------------------------
  // GET /
  // ---------------------------------------------------------------------------

  test('GET / returns empty list', async () => {
    const res = await app.request('/api/recording-rules')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ rules: [] })
  })

  // ---------------------------------------------------------------------------
  // POST /
  // ---------------------------------------------------------------------------

  test('POST / creates a rule and returns 201 with correct shape', async () => {
    const payload = {
      name: `${RULE_NAME_PREFIX}create`,
      enabled: true,
      keyword: 'ニュース',
      keywordMode: 'literal',
      keywordTarget: 'title',
      channelIds: [],
      genres: [],
      dayOfWeek: [],
      priority: 0,
      avoidDuplicates: true
    }

    const res = await app.request('/api/recording-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.name).toBe(payload.name)
    expect(body.enabled).toBe(true)
    expect(body.keyword).toBe('ニュース')
    expect(typeof body.id).toBe('string')
    expect(typeof body.createdAt).toBe('string')
    expect(typeof body.updatedAt).toBe('string')

    // Confirm DB record exists
    const row = await prisma.recordingRule.findUnique({ where: { id: body.id } })
    expect(row).not.toBeNull()
    expect(row?.name).toBe(payload.name)
  })

  test('POST / with invalid regex returns 400', async () => {
    const payload = {
      name: `${RULE_NAME_PREFIX}bad-regex`,
      enabled: true,
      keyword: '[unclosed',
      keywordMode: 'regex',
      keywordTarget: 'title',
      channelIds: [],
      genres: [],
      dayOfWeek: [],
      priority: 0,
      avoidDuplicates: false
    }

    const res = await app.request('/api/recording-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(res.status).toBe(400)
  })

  test('POST / with keyword longer than 200 chars returns 400', async () => {
    const payload = {
      name: `${RULE_NAME_PREFIX}long-kw`,
      enabled: true,
      keyword: 'a'.repeat(201),
      keywordMode: 'literal',
      keywordTarget: 'title',
      channelIds: [],
      genres: [],
      dayOfWeek: [],
      priority: 0,
      avoidDuplicates: false
    }

    const res = await app.request('/api/recording-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(res.status).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // GET /:id
  // ---------------------------------------------------------------------------

  test('GET /:id returns 404 for missing rule', async () => {
    const res = await app.request('/api/recording-rules/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })

  test('GET /:id returns 200 with correct shape for existing rule', async () => {
    const created = await prisma.recordingRule.create({
      data: {
        name: `${RULE_NAME_PREFIX}get-by-id`,
        enabled: true,
        keyword: 'テスト',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const res = await app.request(`/api/recording-rules/${created.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(created.id)
    expect(body.name).toBe(created.name)
  })

  // ---------------------------------------------------------------------------
  // PATCH /:id
  // ---------------------------------------------------------------------------

  test('PATCH /:id toggles enabled from true to false', async () => {
    const created = await prisma.recordingRule.create({
      data: {
        name: `${RULE_NAME_PREFIX}patch-toggle`,
        enabled: true,
        channelIds: [],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const res = await app.request(`/api/recording-rules/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabled).toBe(false)

    const row = await prisma.recordingRule.findUnique({ where: { id: created.id } })
    expect(row?.enabled).toBe(false)
  })

  test('PATCH /:id returns 404 for missing rule', async () => {
    const res = await app.request('/api/recording-rules/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    })

    expect(res.status).toBe(404)
  })

  // ---------------------------------------------------------------------------
  // DELETE /:id
  // ---------------------------------------------------------------------------

  test('DELETE /:id returns 204 and subsequent GET returns 404', async () => {
    const created = await prisma.recordingRule.create({
      data: {
        name: `${RULE_NAME_PREFIX}delete`,
        enabled: true,
        channelIds: [],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const delRes = await app.request(`/api/recording-rules/${created.id}`, {
      method: 'DELETE'
    })
    expect(delRes.status).toBe(204)

    const getRes = await app.request(`/api/recording-rules/${created.id}`)
    expect(getRes.status).toBe(404)
  })

  test('DELETE /:id sets ruleId to null on related schedules (onDelete: SetNull)', async () => {
    const rule = await prisma.recordingRule.create({
      data: {
        name: `${RULE_NAME_PREFIX}delete-setnull`,
        enabled: true,
        channelIds: [],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const schedule = await prisma.recordingSchedule.create({
      data: {
        channelId: 'test-preview-isolated-ch',
        programId: 'test-prog-setnull-1',
        title: 'テスト番組 SetNull',
        startAt: new Date(Date.now() + 3600000),
        endAt: new Date(Date.now() + 7200000),
        ruleId: rule.id
      }
    })

    await app.request(`/api/recording-rules/${rule.id}`, { method: 'DELETE' })

    const updated = await prisma.recordingSchedule.findUnique({ where: { id: schedule.id } })
    expect(updated?.ruleId).toBeNull()

    // Cleanup orphaned schedule
    await prisma.recordingSchedule.delete({ where: { id: schedule.id } })
  })

  // ---------------------------------------------------------------------------
  // POST /preview
  // ---------------------------------------------------------------------------

  test('POST /preview returns matching programs', async () => {
    const now = Date.now()
    const programs = [
      {
        id: 'test-preview-prog-1',
        channelId: 'test-preview-isolated-ch',
        title: 'NHKニュース7',
        description: null,
        startAt: new Date(now + 600000),
        endAt: new Date(now + 3000000),
        genres: ['news']
      },
      {
        id: 'test-preview-prog-2',
        channelId: 'test-preview-isolated-ch',
        title: '朝のニュースワイド',
        description: null,
        startAt: new Date(now + 7200000),
        endAt: new Date(now + 10800000),
        genres: ['news']
      },
      {
        id: 'test-preview-prog-3',
        channelId: 'test-preview-isolated-ch',
        title: 'ドラマスペシャル',
        description: null,
        startAt: new Date(now + 3600000),
        endAt: new Date(now + 7200000),
        genres: ['drama']
      }
    ]

    for (const p of programs) {
      await prisma.program.upsert({ where: { id: p.id }, update: p, create: p })
    }

    const res = await app.request('/api/recording-rules/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${RULE_NAME_PREFIX}preview`,
        enabled: true,
        keyword: 'ニュース',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: ['test-preview-isolated-ch'],
        genres: [],
        dayOfWeek: [],
        priority: 0,
        avoidDuplicates: false,
        windowHours: 24
      })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matchCount).toBe(2)
    expect(body.programs).toHaveLength(2)

    const titles = body.programs.map((p: { title: string }) => p.title)
    expect(titles).toContain('NHKニュース7')
    expect(titles).toContain('朝のニュースワイド')

    await cleanupPrograms()
  })

  test('POST /preview with invalid regex returns 400', async () => {
    const res = await app.request('/api/recording-rules/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${RULE_NAME_PREFIX}preview-bad-regex`,
        enabled: true,
        keyword: '[invalid(',
        keywordMode: 'regex',
        keywordTarget: 'title',
        channelIds: [],
        genres: [],
        dayOfWeek: [],
        priority: 0,
        avoidDuplicates: false
      })
    })

    expect(res.status).toBe(400)
  })
})
