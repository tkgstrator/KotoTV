import { describe, expect, test } from 'bun:test'
import { addHours, subHours } from 'date-fns'
import { mirakcClient } from './mirakc-client'

describe('mirakcClient (integration)', () => {
  test('listServices returns an array of services with expected shape', async () => {
    const services = await mirakcClient.listServices()

    expect(Array.isArray(services)).toBe(true)
    expect(services.length).toBeGreaterThan(0)

    const first = services[0]
    expect(typeof first.id).toBe('number')
    expect(typeof first.serviceId).toBe('number')
    expect(typeof first.networkId).toBe('number')
    expect(typeof first.name).toBe('string')
    expect(first.name.length).toBeGreaterThan(0)
  })

  test('listServices includes GR, BS, or CS channels', async () => {
    const services = await mirakcClient.listServices()
    const types = new Set(services.map((s) => s.channel?.type).filter(Boolean))

    expect(types.size).toBeGreaterThan(0)
    for (const t of types) {
      expect(['GR', 'BS', 'CS']).toContain(t)
    }
  })

  test('listServices filters TV services (type=1)', async () => {
    const services = await mirakcClient.listServices()
    const tvServices = services.filter((s) => s.type === 1)

    expect(tvServices.length).toBeGreaterThan(0)
  })

  test('listPrograms returns programs for a known service', async () => {
    const services = await mirakcClient.listServices()
    const tvService = services.find((s) => s.type === 1)
    expect(tvService).toBeDefined()

    const programs = await mirakcClient.listPrograms(tvService!.id)

    expect(Array.isArray(programs)).toBe(true)
    expect(programs.length).toBeGreaterThan(0)

    const first = programs[0]
    expect(typeof first.id).toBe('number')
    expect(typeof first.serviceId).toBe('number')
    expect(typeof first.startAt).toBe('number')
    expect(typeof first.duration).toBe('number')
    expect(first.duration).toBeGreaterThan(0)
  })

  test('listAllProgramsByServiceId returns a non-empty map', async () => {
    const map = await mirakcClient.listAllProgramsByServiceId()

    expect(map.size).toBeGreaterThan(0)

    for (const [serviceId, programs] of map) {
      expect(typeof serviceId).toBe('number')
      expect(Array.isArray(programs)).toBe(true)
      expect(programs.length).toBeGreaterThan(0)
    }
  })

  test('programs have name (title) field', async () => {
    const services = await mirakcClient.listServices()
    const tvService = services.find((s) => s.type === 1)
    expect(tvService).toBeDefined()

    const programs = await mirakcClient.listPrograms(tvService!.id)
    const withName = programs.filter((p) => p.name && p.name.length > 0)

    expect(withName.length).toBeGreaterThan(0)
  })

  test('listProgramsInRange filters by time window', async () => {
    const services = await mirakcClient.listServices()
    const tvService = services.find((s) => s.type === 1)
    expect(tvService).toBeDefined()

    const now = new Date()
    const startAt = subHours(now, 2)
    const endAt = addHours(now, 2)

    const programs = await mirakcClient.listProgramsInRange({
      channelId: String(tvService!.id),
      startAt,
      endAt
    })

    expect(Array.isArray(programs)).toBe(true)

    for (const p of programs) {
      const programEnd = p.startAt + p.duration
      expect(p.startAt).toBeLessThan(endAt.getTime())
      expect(programEnd).toBeGreaterThan(startAt.getTime())
    }
  })
})
