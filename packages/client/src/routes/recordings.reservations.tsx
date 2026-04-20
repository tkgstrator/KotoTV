import { createFileRoute } from '@tanstack/react-router'
import { addDays, addMinutes, format, setHours, setMinutes, startOfHour } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { RecordingPageHeader } from '@/components/recording/recording-page-header'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/recordings/reservations')({
  component: ReservationsPage
})

// ─── Dummy data ─────────────────────────────────────────────────────────────

interface Reservation {
  id: string
  title: string
  channel: string
  channelType: 'GR' | 'BS' | 'CS'
  startAt: Date
  endAt: Date
  /** Rule that created this reservation, or null for manual. */
  ruleName: string | null
}

function makeDummyReservations(): Reservation[] {
  const base = startOfHour(new Date())
  // Seed a plausible week of upcoming reservations. Mixing rule-driven
  // and manual so the list shows both badges. startAt values snap to
  // broadcast hours (:00 and :30) to stay realistic.
  const at = (day: number, h: number, m = 0) => setMinutes(setHours(addDays(base, day), h), m)
  return [
    {
      id: 'r-1',
      title: 'クローズアップ現代 「円安は続くのか」',
      channel: 'NHK総合1',
      channelType: 'GR',
      startAt: at(0, 19, 30),
      endAt: at(0, 20, 0),
      ruleName: 'NHK 総合 夜のニュース'
    },
    {
      id: 'r-2',
      title: '報道ステーション',
      channel: 'テレビ朝日',
      channelType: 'GR',
      startAt: at(0, 21, 54),
      endAt: addMinutes(at(0, 21, 54), 75),
      ruleName: null
    },
    {
      id: 'r-3',
      title: '深夜アニメ枠「星のかけらを探して」 第 8 話',
      channel: 'TOKYO MX',
      channelType: 'GR',
      startAt: at(1, 1, 0),
      endAt: at(1, 1, 24),
      ruleName: 'アニメ 自動録画'
    },
    {
      id: 'r-4',
      title: 'ガイアの夜明け「地方創生の現場から」',
      channel: 'テレビ東京',
      channelType: 'GR',
      startAt: at(1, 22, 0),
      endAt: at(1, 22, 54),
      ruleName: 'ドキュメンタリー 自動録画'
    },
    {
      id: 'r-5',
      title: 'アニメイズムセレクション「真夜中の航路」 第 4 話',
      channel: 'BS11',
      channelType: 'BS',
      startAt: at(2, 0, 30),
      endAt: at(2, 0, 54),
      ruleName: 'アニメ 自動録画'
    },
    {
      id: 'r-6',
      title: 'プロ野球中継 〜セントラル・リーグ〜',
      channel: 'GAORA SPORTS',
      channelType: 'CS',
      startAt: at(2, 18, 0),
      endAt: at(2, 21, 0),
      ruleName: null
    },
    {
      id: 'r-7',
      title: '映像詩 にっぽんの風景',
      channel: 'NHK BS',
      channelType: 'BS',
      startAt: at(3, 22, 0),
      endAt: at(3, 22, 50),
      ruleName: 'NHK BS 特集'
    }
  ]
}

const DUMMY_RESERVATIONS = makeDummyReservations()

// ─── Helpers ────────────────────────────────────────────────────────────────

function durationLabel(start: Date, end: Date): string {
  const min = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}時間${m}分` : `${h}時間`
}

const TYPE_COLORS: Record<Reservation['channelType'], string> = {
  GR: 'oklch(0.6 0.18 247)',
  BS: 'oklch(0.6 0.18 150)',
  CS: 'oklch(0.7 0.18 65)'
}

function groupByDay(items: Reservation[]): { day: string; items: Reservation[] }[] {
  const groups = new Map<string, Reservation[]>()
  for (const r of items) {
    const key = format(r.startAt, 'yyyy-MM-dd')
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, list]) => ({ day, items: list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime()) }))
}

// ─── Row ────────────────────────────────────────────────────────────────────

function ReservationRow({ r }: { r: Reservation }) {
  const accent = TYPE_COLORS[r.channelType]
  return (
    <div className='flex items-stretch border-b border-border bg-card last:border-b-0 transition-colors hover:bg-muted/40'>
      <div className='w-[3px] shrink-0' style={{ background: accent }} aria-hidden />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3'>
        {/* Top: time · duration · title */}
        <div className='flex items-baseline gap-2'>
          <span className='shrink-0 text-footnote font-semibold tabular-nums text-foreground'>
            {format(r.startAt, 'HH:mm', { locale: ja })}
          </span>
          <span className='shrink-0 text-caption text-muted-foreground'>
            〜{format(r.endAt, 'HH:mm', { locale: ja })}
          </span>
          <span className='shrink-0 text-caption text-muted-foreground'>· {durationLabel(r.startAt, r.endAt)}</span>
          <h3 className='min-w-0 flex-1 truncate text-subheadline font-semibold text-foreground'>{r.title}</h3>
        </div>

        {/* Bottom: channel + rule/manual badge */}
        <div className='flex items-center gap-2'>
          <span className='shrink-0 rounded-sm px-1.5 py-0.5 text-caption2 font-semibold' style={{ color: accent }}>
            {r.channel}
          </span>
          {r.ruleName ? (
            <StatusChip variant='info' size='sm'>
              ルール: {r.ruleName}
            </StatusChip>
          ) : (
            <StatusChip variant='muted' size='sm'>
              手動
            </StatusChip>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

function ReservationsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const groups = groupByDay(DUMMY_RESERVATIONS)
  const totalCount = DUMMY_RESERVATIONS.length
  const ruleCount = DUMMY_RESERVATIONS.filter((r) => r.ruleName != null).length

  return (
    <>
      <RecordingPageHeader
        ariaLabel='録画予約ヘッダー'
        stats={[
          { label: '予約', value: totalCount },
          { label: 'ルール由来', value: ruleCount },
          { label: '手動', value: totalCount - ruleCount }
        ]}
        action={
          <Button size='sm' className='h-8 gap-1.5 px-3 text-footnote' onClick={() => setFormOpen(true)}>
            <CalendarPlus className='size-4' />
            新規予約
          </Button>
        }
      />
      <div className='flex-1 overflow-y-auto pb-16'>
        {groups.length === 0 ? (
          <div className='px-4 py-12'>
            <p className='text-footnote text-muted-foreground'>予約はまだありません</p>
          </div>
        ) : (
          <div className='flex flex-col gap-4 p-4'>
            {groups.map(({ day, items }) => {
              const dayLabel = format(new Date(day), 'M月d日(E)', { locale: ja })
              return (
                <section key={day} className='flex flex-col'>
                  <header
                    className={cn('mb-1.5 flex items-center gap-2 text-footnote font-semibold text-muted-foreground')}
                  >
                    <span>{dayLabel}</span>
                    <span className='text-caption text-muted-foreground/70'>· {items.length} 件</span>
                  </header>
                  <div className='overflow-hidden rounded-[4px] border border-border'>
                    {items.map((r) => (
                      <ReservationRow key={r.id} r={r} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
