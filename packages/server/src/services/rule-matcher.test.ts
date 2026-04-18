import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { prisma } from '../lib/prisma'
import { matches, runRuleMatcher } from './rule-matcher'

// ---------------------------------------------------------------------------
// Types mirroring the internal types in rule-matcher.ts
// ---------------------------------------------------------------------------

type ProgramRow = {
  id: string
  channelId: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  genres: string[]
}

type RuleRow = {
  id: string
  enabled: boolean
  keyword: string | null
  keywordMode: string
  keywordTarget: string
  excludeKeyword: string | null
  channelIds: string[]
  genres: string[]
  dayOfWeek: number[]
  timeStartMinutes: number | null
  timeEndMinutes: number | null
  priority: number
  avoidDuplicates: boolean
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PROGRAM: ProgramRow = {
  id: 'prog-1',
  channelId: 'ch-1',
  title: 'NHKニュース7',
  description: 'その日の主なニュースをお伝えします',
  startAt: new Date('2026-04-18T10:00:00Z'), // 19:00 JST Saturday
  endAt: new Date('2026-04-18T10:30:00Z'),
  genres: ['news']
}

const BASE_RULE: RuleRow = {
  id: 'rule-1',
  enabled: true,
  keyword: null,
  keywordMode: 'literal',
  keywordTarget: 'title',
  excludeKeyword: null,
  channelIds: [],
  genres: [],
  dayOfWeek: [],
  timeStartMinutes: null,
  timeEndMinutes: null,
  priority: 0,
  avoidDuplicates: false
}

// ---------------------------------------------------------------------------
// A: Pure function tests — matches()
// ---------------------------------------------------------------------------

describe('matches(): disabled rule', () => {
  test('always returns false when rule.enabled is false', () => {
    const rule = { ...BASE_RULE, enabled: false }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('returns true when rule.enabled is true and no filters', () => {
    expect(matches(BASE_PROGRAM, BASE_RULE)).toBe(true)
  })
})

describe('matches(): keyword literal mode', () => {
  test('matches title case-insensitively', () => {
    const rule = { ...BASE_RULE, keyword: 'nhkニュース', keywordMode: 'literal', keywordTarget: 'title' }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('does not match when keyword not in title', () => {
    const rule = { ...BASE_RULE, keyword: '天気予報', keywordMode: 'literal', keywordTarget: 'title' }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('null keyword passes all programs', () => {
    const rule = { ...BASE_RULE, keyword: null }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })
})

describe('matches(): keyword target', () => {
  test('keywordTarget title — only checks title', () => {
    const rule = {
      ...BASE_RULE,
      keyword: 'ニュースをお伝え',
      keywordMode: 'literal',
      keywordTarget: 'title'
    }
    // The phrase is in description only, not title
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('keywordTarget title_description — also checks description', () => {
    const rule = {
      ...BASE_RULE,
      keyword: 'ニュースをお伝え',
      keywordMode: 'literal',
      keywordTarget: 'title_description'
    }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })
})

describe('matches(): keyword regex mode', () => {
  test('matches via valid regex', () => {
    const rule = { ...BASE_RULE, keyword: 'NHK.+7', keywordMode: 'regex', keywordTarget: 'title' }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('does not match when regex has no match', () => {
    const rule = { ...BASE_RULE, keyword: '^天気', keywordMode: 'regex', keywordTarget: 'title' }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('invalid regex returns false without throwing', () => {
    const rule = { ...BASE_RULE, keyword: '[unclosed', keywordMode: 'regex', keywordTarget: 'title' }
    expect(() => matches(BASE_PROGRAM, rule)).not.toThrow()
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })
})

describe('matches(): excludeKeyword', () => {
  test('returns false when excludeKeyword matches title', () => {
    const rule = { ...BASE_RULE, excludeKeyword: 'NHK' }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('returns true when excludeKeyword does not match title', () => {
    const rule = { ...BASE_RULE, excludeKeyword: '天気予報' }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('excludeKeyword check is case-insensitive', () => {
    const rule = { ...BASE_RULE, excludeKeyword: 'nhk' }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })
})

describe('matches(): channelIds filter', () => {
  test('empty channelIds allows all channels', () => {
    const rule = { ...BASE_RULE, channelIds: [] }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('matching channelId allows program', () => {
    const rule = { ...BASE_RULE, channelIds: ['ch-1', 'ch-2'] }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('non-matching channelId blocks program', () => {
    const rule = { ...BASE_RULE, channelIds: ['ch-99'] }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })
})

describe('matches(): genres filter', () => {
  test('empty genres allows all', () => {
    const rule = { ...BASE_RULE, genres: [] }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('matching genre allows program', () => {
    const rule = { ...BASE_RULE, genres: ['news', 'sports'] }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('no genre overlap blocks program', () => {
    const rule = { ...BASE_RULE, genres: ['sports', 'drama'] }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })
})

describe('matches(): dayOfWeek filter', () => {
  // BASE_PROGRAM.startAt = 2026-04-18T10:00:00Z = 2026-04-18 19:00 JST = Saturday (6)
  test('empty dayOfWeek allows all', () => {
    const rule = { ...BASE_RULE, dayOfWeek: [] }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('matching day of week allows program', () => {
    const rule = { ...BASE_RULE, dayOfWeek: [6] } // Saturday
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('non-matching day of week blocks program', () => {
    const rule = { ...BASE_RULE, dayOfWeek: [0, 1, 2, 3, 4] } // Sun-Thu, no Saturday
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })
})

describe('matches(): time window filter', () => {
  // BASE_PROGRAM.startAt = 2026-04-18T10:00:00Z = 19:00 JST = 1140 minutes

  test('null timeStartMinutes and timeEndMinutes allows all', () => {
    const rule = { ...BASE_RULE, timeStartMinutes: null, timeEndMinutes: null }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('only timeStartMinutes set (timeEndMinutes null) allows all', () => {
    const rule = { ...BASE_RULE, timeStartMinutes: 540, timeEndMinutes: null }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('program start within same-day window 18:00-20:00 → matches', () => {
    // 18:00 = 1080, 20:00 = 1200, program at 19:00 = 1140
    const rule = { ...BASE_RULE, timeStartMinutes: 1080, timeEndMinutes: 1200 }
    expect(matches(BASE_PROGRAM, rule)).toBe(true)
  })

  test('program start outside same-day window 09:00-18:00 → no match', () => {
    // 9:00 = 540, 18:00 = 1080, program at 19:00 = 1140
    const rule = { ...BASE_RULE, timeStartMinutes: 540, timeEndMinutes: 1080 }
    expect(matches(BASE_PROGRAM, rule)).toBe(false)
  })

  test('day-crossing window 22:00-02:00: 23:00 matches', () => {
    // 22:00 = 1320, 02:00 = 120
    // program at 23:00 JST: 2026-04-18T14:00:00Z = 23:00 JST = 1380 min
    const prog = { ...BASE_PROGRAM, startAt: new Date('2026-04-18T14:00:00Z') }
    const rule = { ...BASE_RULE, timeStartMinutes: 1320, timeEndMinutes: 120 }
    expect(matches(prog, rule)).toBe(true)
  })

  test('day-crossing window 22:00-02:00: 01:00 matches', () => {
    // 01:00 JST = 2026-04-18T16:00:00Z = 60 min
    const prog = { ...BASE_PROGRAM, startAt: new Date('2026-04-18T16:00:00Z') }
    const rule = { ...BASE_RULE, timeStartMinutes: 1320, timeEndMinutes: 120 }
    expect(matches(prog, rule)).toBe(true)
  })

  test('day-crossing window 22:00-02:00: 12:00 does not match', () => {
    // 12:00 JST = 2026-04-18T03:00:00Z = 720 min
    const prog = { ...BASE_PROGRAM, startAt: new Date('2026-04-18T03:00:00Z') }
    const rule = { ...BASE_RULE, timeStartMinutes: 1320, timeEndMinutes: 120 }
    expect(matches(prog, rule)).toBe(false)
  })
})

describe('matches(): non-matching fields do not affect result', () => {
  test('priority does not affect match result', () => {
    const low = { ...BASE_RULE, priority: 0 }
    const high = { ...BASE_RULE, priority: 100 }
    expect(matches(BASE_PROGRAM, low)).toBe(matches(BASE_PROGRAM, high))
  })

  test('avoidDuplicates does not affect match result', () => {
    const r1 = { ...BASE_RULE, avoidDuplicates: true }
    const r2 = { ...BASE_RULE, avoidDuplicates: false }
    expect(matches(BASE_PROGRAM, r1)).toBe(matches(BASE_PROGRAM, r2))
  })
})

// ---------------------------------------------------------------------------
// B: Integration tests — runRuleMatcher() (requires real DB)
// ---------------------------------------------------------------------------

const FUTURE_START = new Date(Date.now() + 60 * 60 * 1000) // 1h from now
const FUTURE_END = new Date(Date.now() + 90 * 60 * 1000) // 1.5h from now

// Use an isolated channelId so real mirakc programs never pollute results
const TEST_CHANNEL_ID = 'test-isolated-ch-__rule-matcher__'

const SEED_PROGRAMS = [
  {
    id: 'test-prog-matcher-1',
    channelId: TEST_CHANNEL_ID,
    title: 'テスト番組ニュース',
    description: null,
    startAt: FUTURE_START,
    endAt: FUTURE_END,
    genres: ['news']
  },
  {
    id: 'test-prog-matcher-2',
    channelId: TEST_CHANNEL_ID,
    title: 'テスト映画上映',
    description: null,
    startAt: new Date(FUTURE_START.getTime() + 3600000),
    endAt: new Date(FUTURE_END.getTime() + 3600000),
    genres: ['movie']
  }
]

const RERUN_PROG_IDS = ['test-prog-rerun-orig', 'test-prog-rerun-repeat']

async function cleanupIntegration() {
  await prisma.recordingSchedule.deleteMany({
    where: { programId: { in: [...SEED_PROGRAMS.map((p) => p.id), ...RERUN_PROG_IDS] } }
  })
  await prisma.program.deleteMany({
    where: { id: { in: [...SEED_PROGRAMS.map((p) => p.id), ...RERUN_PROG_IDS] } }
  })
  await prisma.recordingRule.deleteMany({
    where: { name: { startsWith: '__test_rule_matcher__' } }
  })
}

describe('runRuleMatcher() integration', () => {
  beforeEach(async () => {
    await cleanupIntegration()
    for (const p of SEED_PROGRAMS) {
      await prisma.program.upsert({
        where: { id: p.id },
        update: p,
        create: p
      })
    }
  })

  afterAll(async () => {
    await cleanupIntegration()
  })

  test('creates RecordingSchedule for matching program', async () => {
    const rule = await prisma.recordingRule.create({
      data: {
        name: '__test_rule_matcher__news',
        enabled: true,
        keyword: 'ニュース',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [TEST_CHANNEL_ID],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const result = await runRuleMatcher({
      ruleIds: [rule.id],
      sinceMs: Date.now(),
      untilMs: Date.now() + 7 * 24 * 60 * 60 * 1000
    })

    expect(result.created).toBe(1)
    expect(result.skipped).toBe(0)

    const schedule = await prisma.recordingSchedule.findFirst({
      where: { ruleId: rule.id, programId: 'test-prog-matcher-1' }
    })
    expect(schedule).not.toBeNull()
    expect(schedule?.title).toBe('テスト番組ニュース')
  })

  test('second run does not create duplicates (@@unique ruleId+programId)', async () => {
    const rule = await prisma.recordingRule.create({
      data: {
        name: '__test_rule_matcher__dedup',
        enabled: true,
        keyword: 'ニュース',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [TEST_CHANNEL_ID],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const opts = {
      ruleIds: [rule.id],
      sinceMs: Date.now(),
      untilMs: Date.now() + 7 * 24 * 60 * 60 * 1000
    }

    const first = await runRuleMatcher(opts)
    const second = await runRuleMatcher(opts)

    expect(first.created).toBe(1)
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(1)
  })

  test('avoidDuplicates=true: rerun variant is skipped, only 1 schedule created', async () => {
    const origStart = new Date(FUTURE_START.getTime() + 7200000)
    const origEnd = new Date(FUTURE_END.getTime() + 7200000)
    const rerunStart = new Date(FUTURE_START.getTime() + 10800000)
    const rerunEnd = new Date(FUTURE_END.getTime() + 10800000)

    await prisma.program.upsert({
      where: { id: 'test-prog-rerun-orig' },
      update: {
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01',
        description: null,
        startAt: origStart,
        endAt: origEnd,
        genres: []
      },
      create: {
        id: 'test-prog-rerun-orig',
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01',
        description: null,
        startAt: origStart,
        endAt: origEnd,
        genres: []
      }
    })
    await prisma.program.upsert({
      where: { id: 'test-prog-rerun-repeat' },
      update: {
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01 [リピート]',
        description: null,
        startAt: rerunStart,
        endAt: rerunEnd,
        genres: []
      },
      create: {
        id: 'test-prog-rerun-repeat',
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01 [リピート]',
        description: null,
        startAt: rerunStart,
        endAt: rerunEnd,
        genres: []
      }
    })

    const rule = await prisma.recordingRule.create({
      data: {
        name: '__test_rule_matcher__avoid_dup_rerun',
        enabled: true,
        keyword: 'アニメX',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [TEST_CHANNEL_ID],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: true
      }
    })

    const result = await runRuleMatcher({
      ruleIds: [rule.id],
      sinceMs: Date.now(),
      untilMs: Date.now() + 7 * 24 * 60 * 60 * 1000
    })

    expect(result.created).toBe(1)
    expect(result.skipped).toBe(1)

    const schedules = await prisma.recordingSchedule.findMany({
      where: { ruleId: rule.id }
    })
    expect(schedules).toHaveLength(1)
  })

  test('avoidDuplicates=false: rerun variant is scheduled, 2 schedules created', async () => {
    const origStart = new Date(FUTURE_START.getTime() + 7200000)
    const origEnd = new Date(FUTURE_END.getTime() + 7200000)
    const rerunStart = new Date(FUTURE_START.getTime() + 10800000)
    const rerunEnd = new Date(FUTURE_END.getTime() + 10800000)

    await prisma.program.upsert({
      where: { id: 'test-prog-rerun-orig' },
      update: {
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01',
        description: null,
        startAt: origStart,
        endAt: origEnd,
        genres: []
      },
      create: {
        id: 'test-prog-rerun-orig',
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01',
        description: null,
        startAt: origStart,
        endAt: origEnd,
        genres: []
      }
    })
    await prisma.program.upsert({
      where: { id: 'test-prog-rerun-repeat' },
      update: {
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01 [リピート]',
        description: null,
        startAt: rerunStart,
        endAt: rerunEnd,
        genres: []
      },
      create: {
        id: 'test-prog-rerun-repeat',
        channelId: TEST_CHANNEL_ID,
        title: 'アニメX #01 [リピート]',
        description: null,
        startAt: rerunStart,
        endAt: rerunEnd,
        genres: []
      }
    })

    const rule = await prisma.recordingRule.create({
      data: {
        name: '__test_rule_matcher__no_avoid_dup',
        enabled: true,
        keyword: 'アニメX',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [TEST_CHANNEL_ID],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const result = await runRuleMatcher({
      ruleIds: [rule.id],
      sinceMs: Date.now(),
      untilMs: Date.now() + 7 * 24 * 60 * 60 * 1000
    })

    expect(result.created).toBe(2)
    expect(result.skipped).toBe(0)

    const schedules = await prisma.recordingSchedule.findMany({
      where: { ruleId: rule.id }
    })
    expect(schedules).toHaveLength(2)
  })

  test('disabled rule is not processed', async () => {
    const rule = await prisma.recordingRule.create({
      data: {
        name: '__test_rule_matcher__disabled',
        enabled: false,
        keyword: 'ニュース',
        keywordMode: 'literal',
        keywordTarget: 'title',
        channelIds: [TEST_CHANNEL_ID],
        genres: [],
        dayOfWeek: [],
        avoidDuplicates: false
      }
    })

    const result = await runRuleMatcher({
      ruleIds: [rule.id],
      sinceMs: Date.now(),
      untilMs: Date.now() + 7 * 24 * 60 * 60 * 1000
    })

    expect(result.created).toBe(0)

    const schedules = await prisma.recordingSchedule.findMany({
      where: { ruleId: rule.id }
    })
    expect(schedules).toHaveLength(0)
  })
})
