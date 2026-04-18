/**
 * Seed dev data — idempotent. Currently populates the 完了 recordings tab
 * with a handful of realistic-looking entries so the UI has something to show
 * before real recordings exist.
 *
 * Idempotency key: `programId`. If a schedule with the same programId already
 * exists, it is updated in place; otherwise it is created with a fresh UUID.
 *
 * Run: `bunx prisma db seed` (configured in package.json "prisma" block).
 */
import { prisma } from '../src/lib/prisma.ts'

const SAMPLE_COMPLETED: Array<{
  channelId: string
  title: string
  programId: string
  startOffsetHours: number
  durationMin: number
  sizeMB: number
  thumbnail: string | null
}> = [
  {
    channelId: 'GR-1024-1',
    programId: 'seed-completed-1',
    title: '新春特別番組 箱根駅伝ハイライト',
    startOffsetHours: -24,
    durationMin: 90,
    sizeMB: 3840,
    thumbnail: null
  },
  {
    channelId: 'GR-1024-2',
    programId: 'seed-completed-2',
    title: '報道スペシャル 年末総決算 2025',
    startOffsetHours: -48,
    durationMin: 120,
    sizeMB: 5120,
    thumbnail: null
  },
  {
    channelId: 'BS-211',
    programId: 'seed-completed-3',
    title: '映画劇場「インターステラー」',
    startOffsetHours: -72,
    durationMin: 169,
    sizeMB: 7200,
    thumbnail: null
  },
  {
    channelId: 'GR-1031-1',
    programId: 'seed-completed-4',
    title: 'ドラマ 孤独のグルメ 大晦日スペシャル',
    startOffsetHours: -96,
    durationMin: 120,
    sizeMB: 4800,
    thumbnail: null
  },
  {
    channelId: 'GR-1025-1',
    programId: 'seed-completed-5',
    title: 'アニメ 名探偵コナン 最新話',
    startOffsetHours: -120,
    durationMin: 30,
    sizeMB: 900,
    thumbnail: null
  },
  {
    channelId: 'BS-141',
    programId: 'seed-completed-6',
    title: 'ワールドサッカー ダイジェスト',
    startOffsetHours: -144,
    durationMin: 60,
    sizeMB: 2400,
    thumbnail: null
  }
]

async function seedCompletedRecordings() {
  const now = Date.now()

  for (const entry of SAMPLE_COMPLETED) {
    const startedAt = new Date(now + entry.startOffsetHours * 60 * 60 * 1000)
    const endedAt = new Date(startedAt.getTime() + entry.durationMin * 60 * 1000)

    // Find existing by programId (stable dummy key) so we don't leak new rows on each run.
    const existingSchedule = await prisma.recordingSchedule.findFirst({
      where: { programId: entry.programId, ruleId: null }
    })

    const schedule = existingSchedule
      ? await prisma.recordingSchedule.update({
          where: { id: existingSchedule.id },
          data: {
            channelId: entry.channelId,
            title: entry.title,
            startAt: startedAt,
            endAt: endedAt,
            status: 'completed'
          }
        })
      : await prisma.recordingSchedule.create({
          data: {
            channelId: entry.channelId,
            programId: entry.programId,
            title: entry.title,
            startAt: startedAt,
            endAt: endedAt,
            status: 'completed'
          }
        })

    await prisma.recording.upsert({
      where: { scheduleId: schedule.id },
      create: {
        scheduleId: schedule.id,
        channelId: entry.channelId,
        title: entry.title,
        startedAt,
        endedAt,
        filePath: `/app/data/recordings/${schedule.id}.ts`,
        sizeBytes: BigInt(entry.sizeMB * 1024 * 1024),
        durationSec: entry.durationMin * 60,
        thumbnailUrl: entry.thumbnail,
        status: 'completed'
      },
      update: {
        startedAt,
        endedAt,
        sizeBytes: BigInt(entry.sizeMB * 1024 * 1024),
        durationSec: entry.durationMin * 60,
        status: 'completed'
      }
    })
  }

  console.log(`seeded ${SAMPLE_COMPLETED.length} completed recordings`)
}

async function main() {
  await seedCompletedRecordings()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
