import { describe, expect, test } from 'bun:test'
import { app } from '../app'

describe('/api/channels', () => {
  test('GET / returns 200 with channel array', async () => {
    const res = await app.request('/api/channels')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('channels')
    expect(Array.isArray(body.channels)).toBe(true)
    expect(body.channels.length).toBeGreaterThan(0)
  })

  test('channels have expected shape', async () => {
    const res = await app.request('/api/channels')
    const { channels } = await res.json()

    const ch = channels[0]
    expect(typeof ch.id).toBe('string')
    expect(typeof ch.name).toBe('string')
    expect(typeof ch.serviceId).toBe('number')
    expect(typeof ch.networkId).toBe('number')
    expect(['GR', 'BS', 'CS']).toContain(ch.type)
  })

  test('channels include currentProgram or null', async () => {
    const res = await app.request('/api/channels')
    const { channels } = await res.json()

    for (const ch of channels) {
      if (ch.currentProgram !== null) {
        expect(typeof ch.currentProgram.id).toBe('string')
        expect(typeof ch.currentProgram.title).toBe('string')
        expect(typeof ch.currentProgram.startAt).toBe('string')
        expect(typeof ch.currentProgram.endAt).toBe('string')
      }
    }
  })

  test('GET /?type=GR filters to terrestrial channels', async () => {
    const res = await app.request('/api/channels?type=GR')
    expect(res.status).toBe(200)

    const { channels } = await res.json()
    expect(channels.length).toBeGreaterThan(0)

    for (const ch of channels) {
      expect(ch.type).toBe('GR')
    }
  })

  test('GET /?type=BS filters to BS channels', async () => {
    const res = await app.request('/api/channels?type=BS')
    expect(res.status).toBe(200)

    const { channels } = await res.json()
    expect(channels.length).toBeGreaterThan(0)

    for (const ch of channels) {
      expect(ch.type).toBe('BS')
    }
  })

  test('GET /?type=CS filters to CS channels', async () => {
    const res = await app.request('/api/channels?type=CS')
    expect(res.status).toBe(200)

    const { channels } = await res.json()

    for (const ch of channels) {
      expect(ch.type).toBe('CS')
    }
  })

  test('total channels equals sum of GR + BS + CS', async () => {
    const [allRes, grRes, bsRes, csRes] = await Promise.all([
      app.request('/api/channels'),
      app.request('/api/channels?type=GR'),
      app.request('/api/channels?type=BS'),
      app.request('/api/channels?type=CS')
    ])

    const all = (await allRes.json()).channels.length
    const gr = (await grRes.json()).channels.length
    const bs = (await bsRes.json()).channels.length
    const cs = (await csRes.json()).channels.length

    expect(gr + bs + cs).toBe(all)
  })
})
