import { prisma } from '../src/lib/prisma'

const SEED_RULES = [
  {
    name: 'NHK 総合 夜のニュース',
    enabled: true,
    keyword: 'ニュース',
    keywordMode: 'literal' as const,
    keywordTarget: 'title' as const,
    excludeKeyword: null,
    channelIds: ['gr-1024'],
    genres: ['ニュース/報道'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 19 * 60,
    timeEndMinutes: 22 * 60,
    priority: 10,
    avoidDuplicates: true
  },
  {
    name: 'アニメ 自動録画',
    enabled: true,
    keyword: '.*',
    keywordMode: 'regex' as const,
    keywordTarget: 'title' as const,
    excludeKeyword: '再放送',
    channelIds: ['gr-1031', 'bs-211'],
    genres: ['アニメ/特撮'],
    dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeStartMinutes: null,
    timeEndMinutes: null,
    priority: 20,
    avoidDuplicates: true,
    excludeReruns: true
  },
  {
    name: 'ドキュメンタリー 自動録画',
    enabled: true,
    keyword: 'ガイアの夜明け|プロフェッショナル|クローズアップ現代',
    keywordMode: 'regex' as const,
    keywordTarget: 'title_description' as const,
    excludeKeyword: null,
    channelIds: [],
    genres: ['ドキュメンタリー/教養'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 20 * 60,
    timeEndMinutes: 24 * 60,
    priority: 30,
    avoidDuplicates: true
  },
  {
    name: 'NHK BS 特集',
    enabled: false,
    keyword: '特集',
    keywordMode: 'literal' as const,
    keywordTarget: 'title' as const,
    excludeKeyword: null,
    channelIds: ['bs-101'],
    genres: [],
    dayOfWeek: [5, 6],
    timeStartMinutes: 21 * 60,
    timeEndMinutes: 24 * 60,
    priority: 40,
    avoidDuplicates: false
  }
]

async function main() {
  const existing = await prisma.recordingRule.count()
  if (existing > 0) {
    console.log(`Skipping seed: ${existing} recording rules already exist`)
    return
  }

  for (const rule of SEED_RULES) {
    await prisma.recordingRule.create({ data: rule })
  }
  console.log(`Seeded ${SEED_RULES.length} recording rules`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
