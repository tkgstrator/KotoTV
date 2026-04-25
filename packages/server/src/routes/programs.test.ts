import { describe, expect, test } from 'bun:test'
import { app } from '../app'

describe('/api/programs', () => {
  test('GET / returns 200 with programs array', async () => {
    const now = new Date()
    const startAt = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString()

    const res = await app.request(`/api/programs?startAt=${startAt}&endAt=${endAt}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('programs')
    expect(Array.isArray(body.programs)).toBe(true)
    expect(body.programs.length).toBeGreaterThan(0)
  })

  test('programs have expected shape', async () => {
    const now = new Date()
    const startAt = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString()

    const res = await app.request(`/api/programs?startAt=${startAt}&endAt=${endAt}`)
    const { programs } = await res.json()

    const p = programs[0]
    expect(typeof p.id).toBe('string')
    expect(typeof p.channelId).toBe('string')
    expect(typeof p.title).toBe('string')
    expect(typeof p.startAt).toBe('string')
    expect(typeof p.endAt).toBe('string')
    expect(typeof p.isRecordable).toBe('boolean')
    expect(Array.isArray(p.genres)).toBe(true)
  })

  test('programs fall within requested time range', async () => {
    const now = new Date()
    const startAt = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    const endAt = new Date(now.getTime() + 1 * 60 * 60 * 1000)

    const res = await app.request(`/api/programs?startAt=${startAt.toISOString()}&endAt=${endAt.toISOString()}`)
    const { programs } = await res.json()

    for (const p of programs) {
      const pStart = new Date(p.startAt).getTime()
      const pEnd = new Date(p.endAt).getTime()
      expect(pStart).toBeLessThan(endAt.getTime())
      expect(pEnd).toBeGreaterThan(startAt.getTime())
    }
  })

  test('GET / with channelId filters programs to that channel', async () => {
    const channelsRes = await app.request('/api/channels?type=GR')
    const { channels } = await channelsRes.json()
    expect(channels.length).toBeGreaterThan(0)

    const channelId = channels[0].id
    const now = new Date()
    const startAt = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString()

    const res = await app.request(`/api/programs?channelId=${channelId}&startAt=${startAt}&endAt=${endAt}`)
    expect(res.status).toBe(200)

    const { programs } = await res.json()
    for (const p of programs) {
      expect(p.channelId).toBe(channelId)
    }
  })

  test('future programs have isRecordable=true', async () => {
    const now = new Date()
    const startAt = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString()

    const res = await app.request(`/api/programs?startAt=${startAt}&endAt=${endAt}`)
    const { programs } = await res.json()

    const future = programs.filter((p: { startAt: string }) => new Date(p.startAt).getTime() > now.getTime())

    for (const p of future) {
      expect(p.isRecordable).toBe(true)
    }
  })

  test('GET / without required params returns 400', async () => {
    const res = await app.request('/api/programs')
    expect(res.status).toBe(400)
  })
})
