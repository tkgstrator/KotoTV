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

// ─── Recording Rule ────────────────────────────────────────────────────────

const SEED_RULE = {
  name: 'AT-X アニメ録画',
  enabled: true,
  keyword: null,
  keywordMode: 'literal' as const,
  keywordTarget: 'title' as const,
  excludeKeyword: null,
  channelIds: ['cs-333'],
  genres: ['アニメ/特撮'],
  dayOfWeek: [] as number[],
  timeStartMinutes: null,
  timeEndMinutes: null,
  priority: 10,
  avoidDuplicates: true,
  excludeReruns: true
}

// ─── Seed recording schedules & recordings from AT-X programs ──────────────

async function seedSchedulesAndRecordings(
  ruleId: string,
  profileId: string
): Promise<{ schedules: number; recordings: number }> {
  const now = new Date()
  const programs = await prisma.program.findMany({
    where: { channelId: 'cs-333' },
    orderBy: { startAt: 'desc' },
    take: 50
  })

  if (programs.length === 0) {
    console.log('No AT-X programs in DB — skipping schedule/recording seed')
    return { schedules: 0, recordings: 0 }
  }

  const pastPrograms = programs.filter((p) => p.endAt < now)
  const futurePrograms = programs.filter((p) => p.startAt > now)

  let scheduleCount = 0
  let recordingCount = 0

  for (const program of pastPrograms.slice(0, 3)) {
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

  for (const program of futurePrograms.slice(0, 2)) {
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

  // 2. Recording rule (AT-X only)
  const rule = await prisma.recordingRule.create({
    data: {
      ...SEED_RULE,
      encodeProfileId: profileIds[0]
    }
  })
  console.log('Seeded 1 recording rule (AT-X)')

  // 3. Schedules + recordings from AT-X programs
  const { schedules, recordings } = await seedSchedulesAndRecordings(rule.id, profileIds[0])
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
