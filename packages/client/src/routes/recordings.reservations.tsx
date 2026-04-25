import type { RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import { useRecordingRules } from '@/hooks/useRecordingRules'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/reservations')({
  component: ReservationsPage
})

// ─── Helpers ────────────────────────────────────────────────────────────────

type ChannelBand = 'GR' | 'BS' | 'CS'

function deriveChannelType(channelId: string): ChannelBand {
  const prefix = channelId.split('-')[0]?.toLowerCase()
  if (prefix === 'bs') return 'BS'
  if (prefix === 'cs') return 'CS'
  return 'GR'
}

function durationLabel(startAt: string, endAt: string): string {
  const min = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000))
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}時間${m}分` : `${h}時間`
}

const TYPE_COLORS: Record<ChannelBand, string> = {
  GR: 'oklch(0.6 0.18 247)',
  BS: 'oklch(0.6 0.18 150)',
  CS: 'oklch(0.7 0.18 65)'
}

function groupByDay(items: RecordingSchedule[]): { day: string; items: RecordingSchedule[] }[] {
  const groups = new Map<string, RecordingSchedule[]>()
  for (const r of items) {
    const key = format(new Date(r.startAt), 'yyyy-MM-dd')
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, list]) => ({
      day,
      items: list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    }))
}

// ─── Row ────────────────────────────────────────────────────────────────────

function ReservationRow({
  schedule,
  channelName,
  ruleName
}: {
  schedule: RecordingSchedule
  channelName: string
  ruleName: string | null
}) {
  const channelType = deriveChannelType(schedule.channelId)
  const accent = TYPE_COLORS[channelType]
  const start = new Date(schedule.startAt)
  const end = new Date(schedule.endAt)

  return (
    <div className='flex items-stretch border-b border-border bg-card last:border-b-0 transition-colors hover:bg-muted/40'>
      <div className='w-[3px] shrink-0' style={{ background: accent }} aria-hidden />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <span className='shrink-0 text-footnote font-semibold tabular-nums text-foreground'>
            {format(start, 'HH:mm', { locale: ja })}
          </span>
          <span className='shrink-0 text-caption text-muted-foreground'>〜{format(end, 'HH:mm', { locale: ja })}</span>
          <span className='shrink-0 text-caption text-muted-foreground'>
            · {durationLabel(schedule.startAt, schedule.endAt)}
          </span>
          <h3 className='min-w-0 flex-1 truncate text-subheadline font-semibold text-foreground'>{schedule.title}</h3>
        </div>

        <div className='flex items-center gap-2'>
          <span className='shrink-0 rounded-sm px-1.5 py-0.5 text-caption2 font-semibold' style={{ color: accent }}>
            {channelName}
          </span>
          {ruleName ? (
            <StatusChip variant='info' size='sm'>
              ルール: {ruleName}
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

type ReservationFilter = 'all' | 'rule' | 'manual'

function ReservationsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<ReservationFilter>('all')
  const { data, isPending, isError } = useRecordings()
  const { data: rulesData } = useRecordingRules()
  const { data: channelsData } = useChannels()

  useRecordingEvents()

  const ruleNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const rule of rulesData?.rules ?? []) m.set(rule.id, rule.name)
    return m
  }, [rulesData])

  const channelNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ch of channelsData?.channels ?? []) m.set(ch.id, ch.name)
    return m
  }, [channelsData])

  const pendingSchedules = useMemo(() => {
    return (data?.schedules ?? []).filter((s) => s.status === 'pending')
  }, [data])

  const totalCount = pendingSchedules.length
  const ruleCount = pendingSchedules.filter((s) => s.ruleId != null).length
  const manualCount = totalCount - ruleCount

  const visibleSchedules = pendingSchedules.filter((s) => {
    if (filter === 'rule') return s.ruleId != null
    if (filter === 'manual') return s.ruleId == null
    return true
  })
  const groups = groupByDay(visibleSchedules)

  const tabs = [
    { value: 'all' as const, label: `全て ${totalCount}` },
    { value: 'rule' as const, label: `ルール ${ruleCount}` },
    { value: 'manual' as const, label: `手動 ${manualCount}` }
  ]

  const header = (
    <PageHeader ariaLabel='録画予約ヘッダー'>
      <div className='flex h-full w-[420px] max-w-full self-stretch'>
        <SegmentedFilter ariaLabel='予約フィルタ' tabs={tabs} value={filter} onChange={setFilter} />
      </div>
    </PageHeader>
  )

  if (isPending) {
    return (
      <>
        {header}
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-16 w-full rounded' />
          ))}
        </div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {header}
        <div className='p-4'>
          <Alert variant='destructive'>
            <TriangleAlert />
            <AlertTitle>データの取得に失敗しました</AlertTitle>
            <AlertDescription>録画予約データを読み込めませんでした。再度お試しください。</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className='flex-1 overflow-y-auto pb-16'>
        {groups.length === 0 ? (
          <div className='px-4 py-12'>
            <p className='text-footnote text-muted-foreground'>
              {filter === 'rule'
                ? 'ルール由来の予約はありません'
                : filter === 'manual'
                  ? '手動の予約はありません'
                  : '予約はまだありません — 番組表かルールから追加できます'}
            </p>
          </div>
        ) : (
          <div className='flex flex-col gap-6 px-4 pt-4 pb-4'>
            {groups.map(({ day, items }) => {
              const dayLabel = format(new Date(day), 'M月d日(E)', { locale: ja })
              return (
                <section key={day} className='flex flex-col'>
                  <header className='mb-2 flex items-baseline gap-2'>
                    <h2 className='text-subheadline font-bold text-foreground'>{dayLabel}</h2>
                    <span className='text-footnote text-muted-foreground'>· {items.length} 件</span>
                  </header>
                  <div className='overflow-hidden rounded-[4px] border border-border'>
                    {items.map((s) => (
                      <ReservationRow
                        key={s.id}
                        schedule={s}
                        channelName={channelNameMap.get(s.channelId) ?? s.channelId}
                        ruleName={s.ruleId ? (ruleNameMap.get(s.ruleId) ?? null) : null}
                      />
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
