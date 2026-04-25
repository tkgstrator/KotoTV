import { describe, expect, test } from 'bun:test'
import { app } from '../app'

describe('/api/status', () => {
  test('GET / returns 200 with status ok', async () => {
    const res = await app.request('/api/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
  })
})

describe('/api/version', () => {
  test('GET / returns 200 with version field', async () => {
    const res = await app.request('/api/version')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('version')
    expect(typeof body.version).toBe('string')
  })
})

describe('/api/health', () => {
  test('GET / returns 200 with all subsystem fields', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = await res.json()

    for (const key of ['mirakc', 'postgres', 'ffmpeg', 'tuners', 'disk', 'runtime']) {
      expect(body).toHaveProperty(key)
    }
  })

  test('mirakc health reports ok with version', async () => {
    const res = await app.request('/api/health')
    const { mirakc } = await res.json()

    expect(mirakc.status).toBe('ok')
    expect(typeof mirakc.detail).toBe('string')
    expect(mirakc.detail).toContain('mirakc')
  })

  test('postgres health reports ok', async () => {
    const res = await app.request('/api/health')
    const { postgres } = await res.json()

    expect(postgres.status).toBe('ok')
    expect(typeof postgres.detail).toBe('string')
  })

  test('ffmpeg health reports ok', async () => {
    const res = await app.request('/api/health')
    const { ffmpeg } = await res.json()

    expect(ffmpeg.status).toBe('ok')
    expect(typeof ffmpeg.detail).toBe('string')
    expect(ffmpeg.detail).toContain('ffmpeg')
  })

  test('tuners health reports devices array', async () => {
    const res = await app.request('/api/health')
    const { tuners } = await res.json()

    expect(['ok', 'warn']).toContain(tuners.status)
    expect(Array.isArray(tuners.devices)).toBe(true)
  })

  test('disk health includes breakdown', async () => {
    const res = await app.request('/api/health')
    const { disk } = await res.json()

    expect(['ok', 'warn', 'err']).toContain(disk.status)
    expect(typeof disk.detail).toBe('string')
    expect(disk).toHaveProperty('breakdown')
    expect(typeof disk.breakdown.free).toBe('number')
    expect(typeof disk.breakdown.total).toBe('number')
    expect(disk.breakdown.total).toBeGreaterThan(0)
  })

  test('runtime includes name and version', async () => {
    const res = await app.request('/api/health')
    const { runtime } = await res.json()

    expect(typeof runtime.name).toBe('string')
    expect(typeof runtime.version).toBe('string')
    expect(runtime.name).toBe('Bun')
  })

  test('GET /logs?subsystem=mirakc returns log lines', async () => {
    const res = await app.request('/api/health/logs?subsystem=mirakc')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('lines')
    expect(Array.isArray(body.lines)).toBe(true)
  })
})
