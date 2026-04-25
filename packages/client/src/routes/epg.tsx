import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addDays, addHours, startOfMinute } from 'date-fns'
import { ChevronLeft, ChevronRight, Filter, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EPGGrid } from '@/components/epg/EPGGrid'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { PageHeader } from '@/components/shell/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import type { Program } from '@/hooks/usePrograms'
import { usePrograms } from '@/hooks/usePrograms'
import { CHANNEL_TYPE_TABS, CHANNEL_TYPE_VALUES, type ChannelType } from '@/lib/channel-type'
import { GENRE_CATEGORIES, genreToColor } from '@/lib/program'
import { cn } from '@/lib/utils'

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
  const [genreFilters, setGenreFilters] = useState<string[]>([])
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)

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

  const headerProps = {
    type,
    onChangeType: setType,
    windowStart,
    onPrevDay: goToPrevDay,
    onNextDay: goToNextDay,
    onNow: goToNow,
    genreFilterCount: genreFilters.length,
    onOpenFilter: () => setFilterDialogOpen(true)
  } as const

  if (channelsPending) {
    return (
      <>
        <EpgHeader {...headerProps} />
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
        <EpgHeader {...headerProps} />
        <div className='p-4'>
          <Alert variant='destructive'>
            <TriangleAlert />
            <AlertTitle>サーバーに接続できません</AlertTitle>
            <AlertDescription>mirakc が起動しているか確認してください</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  if (channels.length === 0) {
    return (
      <>
        <EpgHeader {...headerProps} />
        <p className='px-4 py-8 text-body text-muted-foreground'>チャンネルが見つかりません</p>
      </>
    )
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <EpgHeader {...headerProps} />
      <EPGGrid
        channels={channels}
        programsByChannel={programsByChannel}
        loadingChannelIds={loadingChannelIds}
        gridStartAt={windowStart}
        highlightChannelId={highlightChannelId}
        genreFilter={genreFilters}
      />
      <GenreFilterDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        selected={genreFilters}
        onSelectedChange={setGenreFilters}
      />
    </div>
  )
}

// ─── Genre filter dialog ──────────────────────────────────────────────────────

interface GenreFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  onSelectedChange: (genres: string[]) => void
}

function GenreFilterDialog({ open, onOpenChange, selected, onSelectedChange }: GenreFilterDialogProps) {
  function toggle(label: string) {
    onSelectedChange(selected.includes(label) ? selected.filter((g) => g !== label) : [...selected, label])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-[360px] gap-0 p-0' aria-describedby={undefined}>
        <DialogHeader className='flex-row items-center justify-between border-b border-border px-4 py-3'>
          <DialogTitle className='text-body font-bold'>ジャンルフィルター</DialogTitle>
          {selected.length > 0 && (
            <Button
              variant='ghost'
              size='sm'
              className='h-6 px-2 text-caption2 text-muted-foreground'
              onClick={() => onSelectedChange([])}
            >
              すべて解除
            </Button>
          )}
        </DialogHeader>

        <div className='grid grid-cols-2 gap-1.5 p-4'>
          {GENRE_CATEGORIES.map((cat) => {
            const isActive = selected.includes(cat.label)
            return (
              <button
                key={cat.label}
                type='button'
                onClick={() => toggle(cat.label)}
                aria-pressed={isActive}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-footnote font-medium transition-colors',
                  'cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-transparent text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
                style={isActive ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
              >
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', isActive && 'bg-primary-foreground/60')}
                  style={isActive ? undefined : { backgroundColor: cat.color }}
                />
                {cat.label}
              </button>
            )
          })}
        </div>

        <div className='border-t border-border px-4 py-3'>
          <Button size='sm' className='w-full text-footnote font-bold' onClick={() => onOpenChange(false)}>
            {selected.length > 0 ? `${selected.length} 件のジャンルで絞り込み` : '閉じる'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  genreFilterCount: number
  onOpenFilter: () => void
}

function EpgHeader({
  type,
  onChangeType,
  windowStart,
  onPrevDay,
  onNextDay,
  onNow,
  genreFilterCount,
  onOpenFilter
}: EpgHeaderProps) {
  const dateLabel = windowStart.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  })

  return (
    <PageHeader ariaLabel='番組表ヘッダー' className='items-center gap-2 pr-3'>
      {/* Fixed 480px so the filter width matches the channel-list page
          (which uses the same cap). `max-w-full` keeps it from
          overflowing on narrow viewports; `self-stretch` overrides the
          PageHeader's `items-center` so the tab buttons fill the full
          48px and the animated underline stays at the bottom edge. */}
      <div className='flex h-full w-[480px] max-w-full self-stretch'>
        <SegmentedFilter ariaLabel='チャンネル種別' tabs={CHANNEL_TYPE_TABS} value={type} onChange={onChangeType} />
      </div>
      <div className='flex-1' />

      {/* Right half: filter + date navigation + 今すぐ jump */}
      <Button
        variant={genreFilterCount > 0 ? 'default' : 'outline'}
        size='sm'
        className='h-7 shrink-0 gap-1 px-2 text-footnote'
        onClick={onOpenFilter}
        aria-label='ジャンルフィルター'
      >
        <Filter className='size-3' />
        {genreFilterCount > 0 ? genreFilterCount : 'フィルター'}
      </Button>

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
