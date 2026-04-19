import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addDays, addHours, startOfMinute } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { type FilterValue, TypeFilter } from '@/components/channel/TypeFilter'
import { EPGGrid } from '@/components/epg/EPGGrid'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import type { Program } from '@/hooks/usePrograms'
import { usePrograms } from '@/hooks/usePrograms'

const FILTER_VALUES: FilterValue[] = ['ALL', 'GR', 'BS', 'CS']

interface EpgSearch {
  at?: string | undefined
  channel?: string | undefined
  type?: FilterValue | undefined
}

function validateEpgSearch(raw: Record<string, unknown>): EpgSearch {
  const result: EpgSearch = {}
  if (typeof raw.at === 'string') result.at = raw.at
  if (typeof raw.channel === 'string') result.channel = raw.channel
  if (typeof raw.type === 'string' && (FILTER_VALUES as string[]).includes(raw.type)) {
    result.type = raw.type as FilterValue
  }
  return result
}

export const Route = createFileRoute('/epg')({
  validateSearch: validateEpgSearch,
  component: EpgPage
})

function EpgPage() {
  const { at, channel: highlightChannelId, type: typeParam } = Route.useSearch()
  const navigate = useNavigate({ from: '/epg' })
  const type: FilterValue = typeParam ?? 'ALL'

  const windowStart = useMemo(() => {
    const base = at ? new Date(at) : new Date()
    // Snap to the most recent 30-min boundary for a clean grid start
    const ms = base.getTime()
    const snapped = Math.floor(ms / (30 * 60_000)) * (30 * 60_000)
    return startOfMinute(new Date(snapped))
  }, [at])

  const windowEnd = useMemo(() => addHours(windowStart, 8), [windowStart])

  // ISO strings for query keys and API calls
  const startAtISO = windowStart.toISOString()
  const endAtISO = windowEnd.toISOString()

  const { data: channelsData, isPending: channelsPending, isError: channelsError } = useChannels()

  const channels: Channel[] = useMemo(() => {
    const all = channelsData?.channels ?? []
    return type === 'ALL' ? all : all.filter((c) => c.type === type)
  }, [channelsData, type])

  const channelIds = useMemo(() => channels.map((c) => c.id), [channels])

  const { data, isPending: gridPending } = usePrograms({ startAt: startAtISO, endAt: endAtISO })

  const programsByChannel = useMemo(() => {
    const map = new Map<string, Program[]>()
    for (const p of data?.programs ?? []) {
      const bucket = map.get(p.channelId)
      if (bucket) bucket.push(p)
      else map.set(p.channelId, [p])
    }
    return map
  }, [data])

  const loadingChannelIds = useMemo(
    () => (gridPending ? new Set(channelIds) : new Set<string>()),
    [gridPending, channelIds]
  )

  function goToPrevDay() {
    navigate({
      search: (prev) => ({ ...prev, at: addDays(windowStart, -1).toISOString() })
    })
  }

  function goToNextDay() {
    navigate({
      search: (prev) => ({ ...prev, at: addDays(windowStart, 1).toISOString() })
    })
  }

  function goToNow() {
    navigate({ search: (prev) => ({ ...prev, at: undefined }) })
  }

  function setType(value: FilterValue) {
    navigate({ search: (prev) => ({ ...prev, type: value === 'ALL' ? undefined : value }) })
  }

  if (channelsPending) {
    return (
      <>
        <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
        <EpgTypeBar type={type} onChange={setType} />
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-12 w-full rounded' />
          ))}
        </div>
      </>
    )
  }

  if (channelsError) {
    return (
      <>
        <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
        <EpgTypeBar type={type} onChange={setType} />
        <div className='flex flex-col items-center justify-center gap-2 py-16'>
          <StatusChip variant='err'>サーバーに接続できません</StatusChip>
          <p className='text-[0.75rem] text-muted-foreground'>mirakc が起動しているか確認してください</p>
        </div>
      </>
    )
  }

  if (channels.length === 0) {
    return (
      <>
        <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
        <EpgTypeBar type={type} onChange={setType} />
        <p className='px-4 py-8 text-[0.875rem] text-muted-foreground'>チャンネルが見つかりません</p>
      </>
    )
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
      <EpgTypeBar type={type} onChange={setType} />
      <EPGGrid
        channels={channels}
        programsByChannel={programsByChannel}
        loadingChannelIds={loadingChannelIds}
        gridStartAt={windowStart}
        highlightChannelId={highlightChannelId}
      />
    </div>
  )
}

function EpgTypeBar({ type, onChange }: { type: FilterValue; onChange: (v: FilterValue) => void }) {
  return (
    <div className='sticky top-page-header z-20 flex h-page-header shrink-0 border-b border-border bg-background'>
      <TypeFilter value={type} onChange={onChange} />
    </div>
  )
}

// ─── Page header sub-component ─────────────────────────────────────────────────

interface EpgHeaderProps {
  windowStart: Date
  onPrevDay: () => void
  onNextDay: () => void
  onNow: () => void
}

function EpgHeader({ windowStart, onPrevDay, onNextDay, onNow }: EpgHeaderProps) {
  const dateLabel = windowStart.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  })

  return (
    <PageHeader ariaLabel='番組表ヘッダー' className='items-center gap-2 px-3'>
      <div className='flex items-center gap-1.5'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>番組表</h1>
        <StatusChip variant='live' dot size='sm'>
          LIVE
        </StatusChip>
      </div>

      <div className='flex-1' />

      {/* Date navigation */}
      <div className='flex items-center gap-1'>
        <Button
          variant='outline'
          size='sm'
          className='h-7 gap-1 px-2 text-[0.75rem]'
          onClick={onPrevDay}
          aria-label='前日'
        >
          <ChevronLeft className='size-3' />
          前日
        </Button>
        <span className='min-w-[6rem] text-center font-mono text-[0.8rem] font-semibold tabular-nums'>{dateLabel}</span>
        <Button
          variant='outline'
          size='sm'
          className='h-7 gap-1 px-2 text-[0.75rem]'
          onClick={onNextDay}
          aria-label='翌日'
        >
          翌日
          <ChevronRight className='size-3' />
        </Button>
      </div>

      <Button
        variant='default'
        size='sm'
        className='h-7 px-3 text-[0.75rem] font-bold'
        onClick={onNow}
        aria-label='現在時刻へジャンプ'
      >
        今すぐ
      </Button>
    </PageHeader>
  )
}
