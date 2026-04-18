import { describe, expect, test } from 'bun:test'
import { getJstDayOfWeek, getJstMinutes } from './timezone'

// JST = UTC+9

describe('getJstDayOfWeek', () => {
  test('UTC 15:00 on 2026-04-18 is 2026-04-19 00:00 JST → Sunday (0)', () => {
    const date = new Date('2026-04-18T15:00:00Z')
    expect(getJstDayOfWeek(date)).toBe(0)
  })

  test('UTC 03:00 on 2026-04-18 is 2026-04-18 12:00 JST → Saturday (6)', () => {
    const date = new Date('2026-04-18T03:00:00Z')
    expect(getJstDayOfWeek(date)).toBe(6)
  })

  test('boundary: UTC 14:59:59 on 2026-04-18 is 2026-04-18 23:59:59 JST → Saturday (6)', () => {
    const date = new Date('2026-04-18T14:59:59Z')
    expect(getJstDayOfWeek(date)).toBe(6)
  })

  test('UTC 14:59:59.999 is still Saturday, UTC 15:00:00 rolls to Sunday', () => {
    const sat = new Date('2026-04-18T14:59:59.999Z')
    const sun = new Date('2026-04-18T15:00:00.000Z')
    expect(getJstDayOfWeek(sat)).toBe(6)
    expect(getJstDayOfWeek(sun)).toBe(0)
  })

  test('result is independent of process.env.TZ', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      const date = new Date('2026-04-18T15:00:00Z')
      expect(getJstDayOfWeek(date)).toBe(0)
    } finally {
      if (original === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = original
      }
    }
  })

  test('UTC 00:00 Monday is still Sunday in JST (JST = UTC+9, so 09:00 Monday)', () => {
    // 2026-04-20 00:00 UTC = 2026-04-20 09:00 JST = Monday (1)
    const date = new Date('2026-04-20T00:00:00Z')
    expect(getJstDayOfWeek(date)).toBe(1)
  })
})

describe('getJstMinutes', () => {
  test('UTC 03:00 on 2026-04-18 is 12:00 JST → 720 minutes', () => {
    const date = new Date('2026-04-18T03:00:00Z')
    expect(getJstMinutes(date)).toBe(720)
  })

  test('UTC 15:00 is 00:00 JST next day → 0 minutes', () => {
    const date = new Date('2026-04-18T15:00:00Z')
    expect(getJstMinutes(date)).toBe(0)
  })

  test('UTC 14:59 is 23:59 JST → 1439 minutes', () => {
    const date = new Date('2026-04-18T14:59:00Z')
    expect(getJstMinutes(date)).toBe(1439)
  })

  test('UTC 06:30 is 15:30 JST → 930 minutes', () => {
    const date = new Date('2026-04-18T06:30:00Z')
    expect(getJstMinutes(date)).toBe(930)
  })

  test('result is independent of process.env.TZ', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'US/Pacific'
      const date = new Date('2026-04-18T03:00:00Z')
      expect(getJstMinutes(date)).toBe(720)
    } finally {
      if (original === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = original
      }
    }
  })
})
