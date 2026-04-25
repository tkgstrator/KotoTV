import { prisma } from '../src/lib/prisma'

// ─── Encode Profiles ───────────────────────────────────────────────────────

const SEED_PROFILES = [
  {
    name: '標準 (CPU / AVC)',
    mode: 'simple' as const,
    codec: 'avc' as const,
    quality: 'medium' as const,
    timing: 'immediate' as const,
    hwAccel: 'cpu' as const,
    rateControl: 'vbr' as const,
    bitrateKbps: 4000,
    qpValue: 23,
    isDefault: true,
    keepOriginalResolution: true,
    resolution: 'hd720' as const
  },
  {
    name: '高画質 (CPU / HEVC)',
    mode: 'simple' as const,
    codec: 'hevc' as const,
    quality: 'high' as const,
    timing: 'idle' as const,
    hwAccel: 'cpu' as const,
    rateControl: 'vbr' as const,
    bitrateKbps: 6000,
    qpValue: 20,
    isDefault: false,
    keepOriginalResolution: true,
    resolution: 'hd1080' as const
  },
  {
    name: '軽量 (CPU / AVC 720p)',
    mode: 'simple' as const,
    codec: 'avc' as const,
    quality: 'low' as const,
    timing: 'immediate' as const,
    hwAccel: 'cpu' as const,
    rateControl: 'vbr' as const,
    bitrateKbps: 2000,
    qpValue: 28,
    isDefault: false,
    keepOriginalResolution: false,
    resolution: 'hd720' as const
  }
]

// ─── Recording Rules ───────────────────────────────────────────────────────

interface SeedRule {
  name: string
  enabled: boolean
  keyword: string | null
  keywordMode: 'literal' | 'regex'
  keywordTarget: 'title' | 'title_description'
  excludeKeyword: string | null
  channelIds: string[]
  genres: string[]
  dayOfWeek: number[]
  timeStartMinutes: number | null
  timeEndMinutes: number | null
  priority: number
  avoidDuplicates: boolean
  excludeReruns?: boolean
  newOnly?: boolean
  profileIndex: number
}

const SEED_RULES: SeedRule[] = [
  {
    name: 'NHK 総合 夜のニュース',
    enabled: true,
    keyword: 'ニュース',
    keywordMode: 'literal',
    keywordTarget: 'title',
    excludeKeyword: null,
    channelIds: ['gr-1024'],
    genres: ['ニュース/報道'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 19 * 60,
    timeEndMinutes: 22 * 60,
    priority: 10,
    avoidDuplicates: true,
    profileIndex: 0
  },
  {
    name: 'アニメ 自動録画',
    enabled: true,
    keyword: '.*',
    keywordMode: 'regex',
    keywordTarget: 'title',
    excludeKeyword: '再放送',
    channelIds: ['gr-1031', 'bs-211'],
    genres: ['アニメ/特撮'],
    dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeStartMinutes: null,
    timeEndMinutes: null,
    priority: 20,
    avoidDuplicates: true,
    excludeReruns: true,
    profileIndex: 1
  },
  {
    name: 'ドキュメンタリー 自動録画',
    enabled: true,
    keyword: 'ガイアの夜明け|プロフェッショナル|クローズアップ現代',
    keywordMode: 'regex',
    keywordTarget: 'title_description',
    excludeKeyword: null,
    channelIds: [],
    genres: ['ドキュメンタリー/教養'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 20 * 60,
    timeEndMinutes: 24 * 60,
    priority: 30,
    avoidDuplicates: true,
    profileIndex: 0
  },
  {
    name: 'NHK BS 特集',
    enabled: false,
    keyword: '特集',
    keywordMode: 'literal',
    keywordTarget: 'title',
    excludeKeyword: null,
    channelIds: ['bs-101'],
    genres: [],
    dayOfWeek: [5, 6],
    timeStartMinutes: 21 * 60,
    timeEndMinutes: 24 * 60,
    priority: 40,
    avoidDuplicates: false,
    profileIndex: 2
  }
]

// ─── Seed recording schedules & recordings from existing programs ──────────

async function seedSchedulesAndRecordings(
  ruleIds: string[],
  profileIds: string[]
): Promise<{ schedules: number; recordings: number }> {
  const now = new Date()
  const programs = await prisma.program.findMany({
    orderBy: { startAt: 'desc' },
    take: 200
  })

  if (programs.length === 0) {
    console.log('No programs in DB — skipping schedule/recording seed')
    return { schedules: 0, recordings: 0 }
  }

  const pastPrograms = programs.filter((p) => p.endAt < now)
  const futurePrograms = programs.filter((p) => p.startAt > now)

  let scheduleCount = 0
  let recordingCount = 0

  // Create completed schedules + recordings from past programs (up to 10)
  for (const program of pastPrograms.slice(0, 10)) {
    const ruleId = ruleIds[scheduleCount % ruleIds.length]
    const profileId = profileIds[scheduleCount % profileIds.length]
    const durationSec = Math.round((program.endAt.getTime() - program.startAt.getTime()) / 1000)
    const sizeBytes = BigInt(durationSec * 30 * 1024)

    try {
      const schedule = await prisma.recordingSchedule.create({
        data: {
          channelId: program.channelId,
          programId: program.id,
          title: program.title,
          startAt: program.startAt,
          endAt: program.endAt,
          status: 'completed',
          ruleId,
          encodeProfileId: profileId
        }
      })
      scheduleCount++

      await prisma.recording.create({
        data: {
          scheduleId: schedule.id,
          channelId: program.channelId,
          title: program.title,
          startedAt: program.startAt,
          endedAt: program.endAt,
          filePath: `/recordings/${program.channelId}/${program.id}.mp4`,
          sizeBytes,
          durationSec,
          status: 'completed'
        }
      })
      recordingCount++
    } catch (err) {
      const e = err as { code?: string }
      if (e.code === 'P2002') continue
      throw err
    }
  }

  // Create pending schedules from future programs (up to 5)
  for (const program of futurePrograms.slice(0, 5)) {
    const ruleId = ruleIds[scheduleCount % ruleIds.length]
    const profileId = profileIds[scheduleCount % profileIds.length]

    try {
      await prisma.recordingSchedule.create({
        data: {
          channelId: program.channelId,
          programId: program.id,
          title: program.title,
          startAt: program.startAt,
          endAt: program.endAt,
          status: 'pending',
          ruleId,
          encodeProfileId: profileId
        }
      })
      scheduleCount++
    } catch (err) {
      const e = err as { code?: string }
      if (e.code === 'P2002') continue
      throw err
    }
  }

  return { schedules: scheduleCount, recordings: recordingCount }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const existingRules = await prisma.recordingRule.count()
  if (existingRules > 0) {
    console.log(`Skipping seed: ${existingRules} recording rules already exist`)
    return
  }

  // 1. Encode profiles
  const profileIds: string[] = []
  for (const profile of SEED_PROFILES) {
    const row = await prisma.encodeProfile.create({ data: profile })
    profileIds.push(row.id)
  }
  console.log(`Seeded ${SEED_PROFILES.length} encode profiles`)

  // 2. Recording rules (linked to encode profiles)
  const ruleIds: string[] = []
  for (const { profileIndex, ...ruleData } of SEED_RULES) {
    const row = await prisma.recordingRule.create({
      data: {
        ...ruleData,
        encodeProfileId: profileIds[profileIndex]
      }
    })
    ruleIds.push(row.id)
  }
  console.log(`Seeded ${SEED_RULES.length} recording rules`)

  // 3. Schedules + recordings from existing programs
  const { schedules, recordings } = await seedSchedulesAndRecordings(ruleIds, profileIds)
  if (schedules > 0) {
    console.log(`Seeded ${schedules} recording schedules and ${recordings} recordings`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
