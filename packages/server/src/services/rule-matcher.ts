import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { getJstDayOfWeek, getJstMinutes } from '../lib/timezone'
import { emitRecordingEvent } from '../routes/recordings'

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

export function matches(program: ProgramRow, rule: RuleRow): boolean {
  if (!rule.enabled) return false

  // Channel filter (defensive: DB where already handles this)
  if (rule.channelIds.length > 0 && !rule.channelIds.includes(program.channelId)) {
    return false
  }

  // Day of week filter (JST)
  if (rule.dayOfWeek.length > 0) {
    const dow = getJstDayOfWeek(program.startAt)
    if (!rule.dayOfWeek.includes(dow)) return false
  }

  // Time window filter (JST)
  if (rule.timeStartMinutes !== null && rule.timeEndMinutes !== null) {
    const mins = getJstMinutes(program.startAt)
    const s = rule.timeStartMinutes
    const e = rule.timeEndMinutes
    // Handle day-crossing windows (e.g. 22:00–02:00)
    const inRange = s <= e ? mins >= s && mins <= e : mins >= s || mins <= e
    if (!inRange) return false
  }

  // Genre filter
  if (rule.genres.length > 0) {
    const hasMatch = program.genres.some((g) => rule.genres.includes(g))
    if (!hasMatch) return false
  }

  // Exclude keyword (applied to title)
  if (rule.excludeKeyword) {
    const target = program.title.toLowerCase()
    if (target.includes(rule.excludeKeyword.toLowerCase())) return false
  }

  // Keyword match
  if (rule.keyword) {
    const searchIn =
      rule.keywordTarget === 'title_description' ? `${program.title} ${program.description ?? ''}` : program.title

    if (rule.keywordMode === 'regex') {
      try {
        const re = new RegExp(rule.keyword, 'i')
        if (!re.test(searchIn)) return false
      } catch {
        // Invalid regex should have been caught at save time; skip match
        return false
      }
    } else {
      if (!searchIn.toLowerCase().includes(rule.keyword.toLowerCase())) return false
    }
  }

  return true
}

async function resolveConflicts(): Promise<void> {
  const tunerCount = await import('../services/mirakc-client').then((m) => m.mirakcClient.getAvailableTunerCount())

  // Find all pending schedules ordered by startAt
  const pending = await prisma.recordingSchedule.findMany({
    where: { status: 'pending' },
    orderBy: { startAt: 'asc' }
  })

  // Group overlapping schedules
  // For each schedule, find others that overlap its time window
  const toFail: string[] = []

  // Simple time-slot based conflict detection:
  // Collect all unique time points, then for each slot count concurrent schedules
  // Manual schedules (ruleId = null) get priority = +Infinity
  const schedules = pending.map((s) => ({
    id: s.id,
    startAt: s.startAt,
    endAt: s.endAt,
    priority: s.ruleId === null ? Number.MAX_SAFE_INTEGER : 0,
    ruleId: s.ruleId
  }))

  // Fetch priorities from rules
  const ruleIds = [...new Set(schedules.map((s) => s.ruleId).filter((id): id is string => id !== null))]
  if (ruleIds.length > 0) {
    const rules = await prisma.recordingRule.findMany({
      where: { id: { in: ruleIds } },
      select: { id: true, priority: true }
    })
    const priorityMap = new Map(rules.map((r) => [r.id, r.priority]))
    for (const s of schedules) {
      if (s.ruleId !== null) {
        s.priority = priorityMap.get(s.ruleId) ?? 0
      }
    }
  }

  // For each schedule, count how many higher-or-equal priority schedules overlap it
  for (const sched of schedules) {
    const overlapping = schedules.filter(
      (other) => other.id !== sched.id && other.startAt < sched.endAt && other.endAt > sched.startAt
    )

    // Count how many overlap with higher priority than this one
    const higherPriority = overlapping.filter((o) => o.priority > sched.priority)
    if (higherPriority.length >= tunerCount) {
      toFail.push(sched.id)
    }
  }

  if (toFail.length > 0) {
    await prisma.recordingSchedule.updateMany({
      where: { id: { in: toFail } },
      data: { status: 'failed', failureReason: 'tuner_conflict' }
    })
    logger.info(
      { module: 'rule-matcher', failedCount: toFail.length },
      'conflict resolution: marked schedules as failed'
    )
  }
}

export async function runRuleMatcher(options?: {
  ruleIds?: string[]
  sinceMs?: number
  untilMs?: number
}): Promise<{ created: number; skipped: number }> {
  const sinceMs = options?.sinceMs ?? Date.now()
  const untilMs = options?.untilMs ?? sinceMs + 14 * 24 * 60 * 60 * 1000

  const since = new Date(sinceMs)
  const until = new Date(untilMs)

  const rules = await prisma.recordingRule.findMany({
    where: {
      enabled: true,
      ...(options?.ruleIds ? { id: { in: options.ruleIds } } : {})
    }
  })

  let created = 0
  let skipped = 0

  for (const rule of rules) {
    const candidates = await prisma.program.findMany({
      where: {
        startAt: { lt: until },
        endAt: { gt: since },
        ...(rule.channelIds.length > 0 ? { channelId: { in: rule.channelIds } } : {}),
        ...(rule.genres.length > 0 ? { genres: { hasSome: rule.genres } } : {}),
        // For literal keyword, pre-filter at DB level for performance
        ...(rule.keywordMode === 'literal' && rule.keyword
          ? { title: { contains: rule.keyword, mode: 'insensitive' } }
          : {})
      }
    })

    const matched = candidates.filter((p) => matches(p, rule))

    for (const program of matched) {
      // avoidDuplicates: skip if same rule already has a non-failed schedule for same title
      if (rule.avoidDuplicates) {
        const duplicate = await prisma.recordingSchedule.findFirst({
          where: {
            ruleId: rule.id,
            title: program.title,
            status: { in: ['pending', 'recording', 'completed'] }
          }
        })
        if (duplicate) {
          skipped++
          continue
        }
      }

      try {
        await prisma.recordingSchedule.create({
          data: {
            channelId: program.channelId,
            programId: program.id,
            title: program.title,
            startAt: program.startAt,
            endAt: program.endAt,
            ruleId: rule.id
          }
        })
        created++
      } catch (err) {
        const e = err as { code?: string }
        // P2002 = unique constraint violation (ruleId + programId already exists)
        if (e.code === 'P2002') {
          skipped++
        } else {
          throw err
        }
      }
    }

    if (created > 0) {
      emitRecordingEvent({ type: 'rule-matched', ruleId: rule.id, createdCount: created })
    }
  }

  await resolveConflicts()

  logger.info({ module: 'rule-matcher', created, skipped }, 'rule matcher run complete')
  return { created, skipped }
}

let _matcherTimer: ReturnType<typeof setTimeout> | null = null
let _matcherRunning: Promise<unknown> | null = null

export function startRuleMatcherScheduler(): void {
  const INTERVAL_MS = 30 * 60 * 1000

  const tick = async () => {
    _matcherRunning = runRuleMatcher().catch((err) => {
      logger.warn({ module: 'rule-matcher', err }, 'scheduled rule matcher run failed')
    })
    await _matcherRunning
    _matcherRunning = null
    _matcherTimer = setTimeout(tick, INTERVAL_MS)
  }

  _matcherTimer = setTimeout(tick, INTERVAL_MS)
  logger.info({ module: 'rule-matcher', intervalMs: INTERVAL_MS }, 'rule matcher scheduler started')
}

export async function stopRuleMatcherScheduler(): Promise<void> {
  if (_matcherTimer !== null) {
    clearTimeout(_matcherTimer)
    _matcherTimer = null
  }
  if (_matcherRunning !== null) {
    await _matcherRunning
  }
}
