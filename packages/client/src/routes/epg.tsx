import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addDays, addHours, startOfMinute } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { EPGGrid } from '@/components/epg/EPGGrid'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import type { Program } from '@/hooks/usePrograms'
import { usePrograms } from '@/hooks/usePrograms'
import { CHANNEL_TYPE_TABS, CHANNEL_TYPE_VALUES, type ChannelType } from '@/lib/channel-type'

interface EpgSearch {
  at?: string | undefined
  channel?: string | undefined
  type?: ChannelType | undefined
}

function validateEpgSearch(raw: Record<string, unknown>): EpgSearch {
  const result: EpgSearch = {}
  if (typeof raw.at === 'string') result.at = raw.at
  if (typeof raw.channel === 'string') result.channel = raw.channel
  if (typeof raw.type === 'string' && (CHANNEL_TYPE_VALUES as string[]).includes(raw.type)) {
    result.type = raw.type as ChannelType
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
  const type: ChannelType = typeParam ?? 'GR'

  // Rolling window: starts at the current 30-min boundary (or `at` when
  // navigating other days) and extends 12 h forward. Past programs are not
  // shown — the window always begins at "now" on the default view.
  const windowStart = useMemo(() => {
    const base = at ? new Date(at) : new Date()
    const ms = base.getTime()
    const snapped = Math.floor(ms / (30 * 60_000)) * (30 * 60_000)
    return startOfMinute(new Date(snapped))
  }, [at])

  const windowEnd = useMemo(() => addHours(windowStart, 12), [windowStart])

  // ISO strings for query keys and API calls
  const startAtISO = windowStart.toISOString()
  const endAtISO = windowEnd.toISOString()

  const { data: channelsData, isPending: channelsPending, isError: channelsError } = useChannels()

  const channels: Channel[] = useMemo(() => {
    const all = channelsData?.channels ?? []
    return all.filter((c) => c.type === type)
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

  function setType(value: ChannelType) {
    // GR is the default — omit it from the URL so the path stays clean.
    navigate({ search: (prev) => ({ ...prev, type: value === 'GR' ? undefined : value }) })
  }

  if (channelsPending) {
    return (
      <>
        <EpgHeader
          type={type}
          onChangeType={setType}
          windowStart={windowStart}
          onPrevDay={goToPrevDay}
          onNextDay={goToNextDay}
          onNow={goToNow}
        />
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
        <EpgHeader
          type={type}
          onChangeType={setType}
          windowStart={windowStart}
          onPrevDay={goToPrevDay}
          onNextDay={goToNextDay}
          onNow={goToNow}
        />
        <div className='flex flex-col items-center justify-center gap-2 py-16'>
          <StatusChip variant='err'>サーバーに接続できません</StatusChip>
          <p className='text-footnote text-muted-foreground'>mirakc が起動しているか確認してください</p>
        </div>
      </>
    )
  }

  if (channels.length === 0) {
    return (
      <>
        <EpgHeader
          type={type}
          onChangeType={setType}
          windowStart={windowStart}
          onPrevDay={goToPrevDay}
          onNextDay={goToNextDay}
          onNow={goToNow}
        />
        <p className='px-4 py-8 text-body text-muted-foreground'>チャンネルが見つかりません</p>
      </>
    )
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <EpgHeader
        type={type}
        onChangeType={setType}
        windowStart={windowStart}
        onPrevDay={goToPrevDay}
        onNextDay={goToNextDay}
        onNow={goToNow}
      />
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

// ─── Page header sub-component ─────────────────────────────────────────────────

interface EpgHeaderProps {
  type: ChannelType
  onChangeType: (v: ChannelType) => void
  windowStart: Date
  onPrevDay: () => void
  onNextDay: () => void
  onNow: () => void
}

function EpgHeader({ type, onChangeType, windowStart, onPrevDay, onNextDay, onNow }: EpgHeaderProps) {
  const dateLabel = windowStart.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  })

  return (
    <PageHeader ariaLabel='番組表ヘッダー' className='items-center gap-2 pr-3'>
      {/* Left half: channel-type filter — takes the free space so the tabs
          stretch to fill the available width without growing into the
          date-navigation cluster on the right. `self-stretch` overrides
          the PageHeader's `items-center` so the tab buttons fill the
          full 48px height (otherwise they collapse to text height and
          the bottom underline detaches). */}
      <div className='flex min-w-0 flex-1 self-stretch'>
        <SegmentedFilter ariaLabel='チャンネル種別' tabs={CHANNEL_TYPE_TABS} value={type} onChange={onChangeType} />
      </div>

      {/* Right half: date navigation + 今すぐ jump */}
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          variant='outline'
          size='sm'
          className='h-7 gap-1 px-2 text-footnote'
          onClick={onPrevDay}
          aria-label='前日'
        >
          <ChevronLeft className='size-3' />
          前日
        </Button>
        <span className='min-w-[6rem] text-center font-mono text-footnote font-semibold tabular-nums'>{dateLabel}</span>
        <Button
          variant='outline'
          size='sm'
          className='h-7 gap-1 px-2 text-footnote'
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
        className='h-7 shrink-0 px-3 text-footnote font-bold'
        onClick={onNow}
        aria-label='今日へジャンプ'
      >
        今日
      </Button>
    </PageHeader>
  )
}
