import type { Recording } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute } from '@tanstack/react-router'
import { addMinutes, startOfHour, subDays, subHours } from 'date-fns'
import { useMemo, useState } from 'react'
import { DoneCard } from '@/components/recording/recording-list-items'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/completed')({
  component: CompletedPage
})

// ─── Dummy data ─────────────────────────────────────────────────────────────
//
// The backend is still empty while the recording pipeline is being built
// (see docs/plans/roadmap.md). Ship a handful of plausible sample entries
// so the YouTube-style grid has something to render — drop these as soon
// as real Recording rows start coming back from the API.

type ChannelBand = 'GR' | 'BS' | 'CS'

interface DummyProgram {
  channelId: string
  channelName: string
  channelType: ChannelBand
  title: string
  /** Hours back from "now" when the show started. */
  hoursAgo: number
  /** Duration in minutes. */
  minutes: number
  /** Rough file size in MB per minute (~30 for HD, ~60 for 4K). */
  mbPerMinute: number
}

const DUMMY_PROGRAMS: readonly DummyProgram[] = [
  {
    channelId: 'gr-1024',
    channelName: 'NHK総合1',
    channelType: 'GR',
    title: 'クローズアップ現代 「AI 時代の医療革命 — 現場はどう変わるか」',
    hoursAgo: 6,
    minutes: 30,
    mbPerMinute: 32
  },
  {
    channelId: 'gr-1025',
    channelName: 'NHKEテレ',
    channelType: 'GR',
    title: '地球ドラマチック「アルプスの野生動物たち」',
    hoursAgo: 14,
    minutes: 45,
    mbPerMinute: 34
  },
  {
    channelId: 'gr-1026',
    channelName: '日テレ',
    channelType: 'GR',
    title: 'ヒルナンデス!',
    hoursAgo: 28,
    minutes: 115,
    mbPerMinute: 30
  },
  {
    channelId: 'gr-1031',
    channelName: 'TOKYO MX',
    channelType: 'GR',
    title: '深夜アニメ枠 第 7 話「星のかけらを探して」',
    hoursAgo: 38,
    minutes: 24,
    mbPerMinute: 28
  },
  {
    channelId: 'gr-1027',
    channelName: 'TBS',
    channelType: 'GR',
    title: '報道特集「選挙を追う 有権者の声」',
    hoursAgo: 54,
    minutes: 55,
    mbPerMinute: 30
  },
  {
    channelId: 'gr-1028',
    channelName: 'フジテレビ',
    channelType: 'GR',
    title: 'ミュージックフェア',
    hoursAgo: 74,
    minutes: 30,
    mbPerMinute: 32
  },
  {
    channelId: 'gr-1029',
    channelName: 'テレビ朝日',
    channelType: 'GR',
    title: '報道ステーション',
    hoursAgo: 82,
    minutes: 75,
    mbPerMinute: 30
  },
  {
    channelId: 'gr-1030',
    channelName: 'テレビ東京',
    channelType: 'GR',
    title: 'ガイアの夜明け「町工場 X 世界市場」',
    hoursAgo: 100,
    minutes: 55,
    mbPerMinute: 30
  },
  {
    channelId: 'bs-101',
    channelName: 'NHK BS',
    channelType: 'BS',
    title: '映像詩 にっぽんの風景',
    hoursAgo: 120,
    minutes: 50,
    mbPerMinute: 48
  },
  {
    channelId: 'bs-211',
    channelName: 'BS11',
    channelType: 'BS',
    title: 'アニメイズムセレクション「真夜中の航路」 第 3 話',
    hoursAgo: 140,
    minutes: 24,
    mbPerMinute: 42
  },
  {
    channelId: 'bs-141',
    channelName: 'BS日テレ',
    channelType: 'BS',
    title: '大相撲ダイジェスト',
    hoursAgo: 168,
    minutes: 60,
    mbPerMinute: 40
  },
  {
    channelId: 'cs-6090',
    channelName: 'GAORA SPORTS',
    channelType: 'CS',
    title: 'プロ野球中継 〜シーズンハイライト〜',
    hoursAgo: 200,
    minutes: 180,
    mbPerMinute: 38
  }
]

const UUID_SEED = '00000000-0000-4000-8000-000000000000'

function dummyUuid(i: number): string {
  // Deterministic pseudo-UUID so React keys stay stable across renders.
  const hex = i.toString(16).padStart(12, '0')
  return UUID_SEED.slice(0, 24) + hex
}

function makeDummyRecordings(): Recording[] {
  const now = startOfHour(new Date())
  return DUMMY_PROGRAMS.map((p, i) => {
    const startedAt = subHours(now, p.hoursAgo)
    const endedAt = addMinutes(startedAt, p.minutes)
    const createdAt = subDays(startedAt, 0)
    const sizeBytes = Math.round(p.minutes * p.mbPerMinute * 1024 * 1024)
    return {
      id: dummyUuid(i * 2 + 1),
      scheduleId: dummyUuid(i * 2 + 2),
      channelId: p.channelId,
      title: p.title,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      filePath: `/recordings/${p.channelId}-${i}.mp4`,
      sizeBytes,
      durationSec: p.minutes * 60,
      thumbnailUrl: null,
      status: 'completed',
      createdAt: createdAt.toISOString(),
      updatedAt: endedAt.toISOString()
    } satisfies Recording
  })
}

const DUMMY_RECORDINGS = makeDummyRecordings()

const CHANNEL_LOOKUP: Map<string, { name: string; type: ChannelBand }> = new Map(
  DUMMY_PROGRAMS.map((p) => [p.channelId, { name: p.channelName, type: p.channelType }])
)

// ────────────────────────────────────────────────────────────────────────────

function CompletedPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()

  useRecordingEvents()

  const items = useMemo(() => {
    const real = (data?.recordings ?? [])
      .filter((r) => r.status === 'completed')
      .sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime())
    // Fall back to dummy data until the recording pipeline is wired up.
    return real.length > 0 ? real : DUMMY_RECORDINGS
  }, [data])

  if (isPending) {
    return (
      <div className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-8 p-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
          <div key={i} className='flex flex-col gap-2'>
            <Skeleton className='aspect-video w-full rounded-xl' />
            <Skeleton className='h-4 w-5/6' />
            <Skeleton className='h-3 w-2/3' />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className='px-4 py-12'>
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
          録画データの取得に失敗しました
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='flex-1 overflow-y-auto pb-16'>
        {/* YouTube-style responsive grid: ~260px min card, gap tuned so
            the rows breathe like the YT home feed. */}
        <div className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-8 px-4 py-4'>
          {items.map((r) => {
            const info = CHANNEL_LOOKUP.get(r.channelId)
            return <DoneCard key={r.id} rec={r} channelName={info?.name ?? r.channelId} />
          })}
        </div>
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
