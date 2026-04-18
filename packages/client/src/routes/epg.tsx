import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addDays, addHours, startOfMinute } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { EPGGrid } from '@/components/epg/EPGGrid'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import type { Program } from '@/hooks/usePrograms'
import { useProgramsForChannels } from '@/hooks/usePrograms'

interface EpgSearch {
  at?: string | undefined
  channel?: string | undefined
}

function validateEpgSearch(raw: Record<string, unknown>): EpgSearch {
  const result: EpgSearch = {}
  if (typeof raw.at === 'string') result.at = raw.at
  if (typeof raw.channel === 'string') result.channel = raw.channel
  return result
}

export const Route = createFileRoute('/epg')({
  validateSearch: validateEpgSearch,
  component: EpgPage
})

function EpgPage() {
  const { at, channel: highlightChannelId } = Route.useSearch()
  const navigate = useNavigate({ from: '/epg' })

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

  const channels: Channel[] = useMemo(() => channelsData?.channels ?? [], [channelsData])

  const channelIds = useMemo(() => channels.map((c) => c.id), [channels])

  const programQueries = useProgramsForChannels(channelIds, startAtISO, endAtISO)

  const programsByChannel = useMemo(() => {
    const map = new Map<string, Program[]>()
    for (let i = 0; i < channelIds.length; i++) {
      const id = channelIds[i]
      const result = programQueries[i]
      if (id && result?.data?.programs) {
        map.set(id, result.data.programs)
      }
    }
    return map
  }, [channelIds, programQueries])

  const loadingChannelIds = useMemo(() => {
    const set = new Set<string>()
    for (let i = 0; i < channelIds.length; i++) {
      const id = channelIds[i]
      if (id && programQueries[i]?.isPending) set.add(id)
    }
    return set
  }, [channelIds, programQueries])

  function goToPrevDay() {
    navigate({
      search: { at: addDays(windowStart, -1).toISOString() }
    })
  }

  function goToNextDay() {
    navigate({
      search: { at: addDays(windowStart, 1).toISOString() }
    })
  }

  function goToNow() {
    navigate({ search: {} })
  }

  if (channelsPending) {
    return (
      <>
        <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
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
        <p className='px-4 py-8 text-[0.875rem] text-muted-foreground'>チャンネルが見つかりません</p>
      </>
    )
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <EpgHeader windowStart={windowStart} onPrevDay={goToPrevDay} onNextDay={goToNextDay} onNow={goToNow} />
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
