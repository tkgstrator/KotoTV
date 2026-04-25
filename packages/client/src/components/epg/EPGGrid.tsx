/**
 * EPGGrid — vertical time-axis desktop grid + mobile agenda view.
 *
 * Desktop (md+): channels-as-columns, time flows downward.
 *   - Sticky top: channel header row
 *   - Sticky left: time labels
 *   - Programs are absolutely positioned within their column by top+height
 *   - No row virtualiser needed (~100-200 nodes for 8h × 15ch)
 *
 * Mobile (<md):
 *   - Channel quick-jump strip (horizontally scrollable chips)
 *   - Agenda view with per-section virtualisation via @tanstack/react-virtual
 */

import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { addHours, format, startOfHour } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StatusChip } from '@/components/shared/status-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { useClock } from '@/hooks/useClock'
import { formatTimeRange, genreToColor } from '@/lib/program'
import { cn } from '@/lib/utils'
import { ProgramCell } from './ProgramCell'
import { ProgramDetailDialog } from './ProgramDetailDialog'

/** Pixels per minute on the vertical axis. 3px/min = 180px/hour. */
const PX_PER_MIN = 3

/** Width of the sticky left time-label column in px. */
const TIME_COL_W = 52

/** Height of the sticky top channel header row in px. */
const CH_HEADER_H = 48

/** Number of hours shown in the future grid. */
const GRID_HOURS = 8

/** Estimated height for one agenda section: header (32) + ~4 programs × 72px. */
const AGENDA_SECTION_ESTIMATE = 32 + 4 * 72

interface EPGGridProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  /** ISO string marking the top edge of the future grid (typically next half-hour boundary). */
  gridStartAt: Date
  /** ISO string for the highlighted channel (from ?channel= search param). */
  highlightChannelId?: string | undefined
}

// ─── Future grid helpers ───────────────────────────────────────────────────────

function clipPrograms(programs: Program[], gridStart: Date, gridEnd: Date): Program[] {
  return programs.filter((p) => new Date(p.endAt) > gridStart && new Date(p.startAt) < gridEnd)
}

/** Returns vertical offset in px from the grid top for a given date. */
function dateToOffset(date: Date, gridStart: Date): number {
  return Math.max(0, (date.getTime() - gridStart.getTime()) / (60_000 / PX_PER_MIN))
}

/** Returns the pixel height of a program block within the grid. */
function programHeight(program: Program, gridStart: Date, gridEnd: Date): number {
  const start = Math.max(new Date(program.startAt).getTime(), gridStart.getTime())
  const end = Math.min(new Date(program.endAt).getTime(), gridEnd.getTime())
  return Math.max(4, (end - start) / (60_000 / PX_PER_MIN))
}

/** Type badge colour: GR=blue, BS=green, CS/SKY=muted */
function channelTypeBadgeClass(type: Channel['type']): string {
  if (type === 'GR') return 'bg-primary/12 border-primary/35 text-primary'
  if (type === 'BS') return 'bg-success/12 border-success/35 text-success'
  return 'bg-muted border-border text-muted-foreground'
}

// ─── Desktop future grid (vertical time axis) ─────────────────────────────────

interface FutureGridProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  gridStart: Date
  gridEnd: Date
  now: Date
  onProgramSelect: (program: Program) => void
}

function FutureGrid({
  channels,
  programsByChannel,
  loadingChannelIds,
  gridStart,
  gridEnd,
  now,
  onProgramSelect
}: FutureGridProps) {
  const totalHeight = GRID_HOURS * 60 * PX_PER_MIN
  const scrollRef = useRef<HTMLDivElement>(null)

  const hourTicks = useMemo(() => {
    const ticks: Date[] = []
    let cursor = startOfHour(addHours(gridStart, 1))
    while (cursor < gridEnd) {
      ticks.push(cursor)
      cursor = addHours(cursor, 1)
    }
    return ticks
  }, [gridStart, gridEnd])

  const nowOffset = useMemo(() => dateToOffset(now, gridStart), [now, gridStart])
  const showIndicator = nowOffset > 0 && nowOffset < totalHeight

  return (
    <section
      ref={scrollRef}
      aria-label='これからの番組グリッド（縦時刻軸）'
      className='relative overflow-auto [scrollbar-width:thin]'
      style={{ height: '100%' }}
    >
      {/*
       * epg-table is a CSS Grid:
       *   column 0: TIME_COL_W px (sticky left, time labels)
       *   columns 1-N: minmax(120px, 1fr) per channel
       *
       * Row structure inside the grid:
       *   row 0: CH_HEADER_H sticky top — channel header cells
       *   row 1: totalHeight relative — the time body (holds time labels + program columns)
       *
       * The channel program columns are positioned absolutely within their column track
       * using a `position:relative` wrapper of totalHeight. This avoids a per-hour row
       * approach (which breaks absolute positioning across hour boundaries for multi-hour
       * programs spanning grid rows).
       */}
      <div
        className='relative min-w-max'
        style={{
          display: 'grid',
          gridTemplateColumns: `${TIME_COL_W}px repeat(${channels.length}, minmax(120px, 1fr))`
        }}
      >
        {/* ── Header row (sticky top) ── */}

        {/* Corner cell — sticky top + left */}
        <div
          aria-hidden
          className='sticky left-0 top-0 z-30 flex items-center justify-center border-b-2 border-r-2 border-border bg-card'
          style={{ height: CH_HEADER_H }}
        >
          <span className='font-mono text-[0.65rem] font-bold text-muted-foreground'>時刻</span>
        </div>

        {/* Channel header cells — sticky top */}
        {channels.map((ch) => (
          <Link
            key={ch.id}
            to='/live/$channelId'
            params={{ channelId: ch.id }}
            aria-label={`${ch.name} を視聴`}
            className={cn(
              'sticky top-0 z-20 flex flex-col items-center justify-center gap-[2px] border-b-2 border-r border-border bg-card px-1 py-1 text-center',
              'cursor-pointer transition-colors hover:bg-muted/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
            )}
            style={{ height: CH_HEADER_H }}
          >
            <span
              className={cn(
                'inline-flex items-center rounded-[3px] border px-[4px] py-[1px] font-mono text-[0.5625rem] font-bold leading-none tracking-[0.06em] uppercase',
                channelTypeBadgeClass(ch.type)
              )}
            >
              {ch.type}
            </span>
            <span className='font-mono text-[0.65rem] font-extrabold leading-none'>{ch.channelNumber}</span>
            <span className='max-w-full truncate text-[0.5625rem] leading-[1.2] text-muted-foreground'>
              {ch.name.length > 8 ? `${ch.name.slice(0, 8)}…` : ch.name}
            </span>
          </Link>
        ))}

        {/* ── Time labels column (sticky left) ── */}
        <div
          aria-hidden
          className='sticky left-0 z-15 border-r-2 border-border bg-card'
          style={{ height: totalHeight, position: 'relative' }}
        >
          {hourTicks.map((tick) => {
            const top = dateToOffset(tick, gridStart)
            const isCurrentHour = now >= tick && now < addHours(tick, 1)
            return (
              <div
                key={tick.toISOString()}
                className={cn(
                  'absolute left-0 right-0 flex items-start border-b border-border/40 px-[4px] pt-[3px]',
                  isCurrentHour && 'bg-destructive/6'
                )}
                style={{ top, height: 60 * PX_PER_MIN }}
              >
                <span
                  className={cn(
                    'font-mono text-[0.6875rem] font-bold tabular-nums',
                    isCurrentHour ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {format(tick, 'HH:mm')}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Channel program columns ── */}
        {channels.map((ch) => {
          const programs = clipPrograms(programsByChannel.get(ch.id) ?? [], gridStart, gridEnd)
          const isLoading = loadingChannelIds.has(ch.id)

          return (
            <div
              key={ch.id}
              data-channel-id={ch.id}
              className='relative border-r border-border bg-background'
              style={{ height: totalHeight }}
            >
              {/* Hour boundary lines — drawn as thin horizontal rules across the column */}
              {hourTicks.map((tick) => (
                <div
                  key={tick.toISOString()}
                  aria-hidden
                  className='pointer-events-none absolute left-0 right-0 border-b border-border/40'
                  style={{ top: dateToOffset(tick, gridStart) + 60 * PX_PER_MIN - 1 }}
                />
              ))}

              {isLoading ? (
                <div className='absolute inset-x-[2px] top-1 flex flex-col gap-1'>
                  <Skeleton className='h-[54px] w-full rounded' />
                  <Skeleton className='h-[90px] w-full rounded' />
                  <Skeleton className='h-[54px] w-full rounded' />
                </div>
              ) : programs.length === 0 ? (
                <div className='absolute inset-0 flex items-start justify-center pt-3'>
                  <span className='text-[0.6rem] text-muted-foreground'>番組情報なし</span>
                </div>
              ) : (
                programs.map((p) => {
                  const top = dateToOffset(new Date(p.startAt), gridStart)
                  const height = programHeight(p, gridStart, gridEnd)
                  return (
                    <div
                      key={p.id}
                      className='absolute inset-x-[1px] px-0'
                      style={{ top: top + 1, height: height - 1 }}
                    >
                      <ProgramCell
                        program={p}
                        heightPx={height}
                        className='h-full w-full'
                        onClick={() => onProgramSelect(p)}
                      />
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>

      {/* NOW indicator — horizontal 2px line + left circle dot.
          Uses position:sticky top so it stays visible even after scrolling past it,
          but we position it absolutely within the scroll container using the grid's
          internal coordinate: CH_HEADER_H + nowOffset. */}
      {showIndicator && (
        <div
          aria-hidden
          className='pointer-events-none absolute left-0 right-0 z-25 h-[2px] bg-destructive'
          style={{ top: CH_HEADER_H + nowOffset }}
        >
          <span
            className='absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-destructive'
            style={{ marginLeft: TIME_COL_W - 4 }}
          />
        </div>
      )}
    </section>
  )
}

// ─── Mobile: Channel quick-jump chip strip ─────────────────────────────────────

interface ChannelChipStripProps {
  channels: Channel[]
  activeChannelId: string | null
  onChipClick: (channelId: string) => void
}

function ChannelChipStrip({ channels, activeChannelId, onChipClick }: ChannelChipStripProps) {
  const stripRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = stripRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons) return
    const arr = Array.from(buttons)
    const focused = document.activeElement
    const idx = arr.indexOf(focused as HTMLButtonElement)
    if (idx === -1) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      arr[(idx + 1) % arr.length]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      arr[(idx - 1 + arr.length) % arr.length]?.focus()
    }
  }, [])

  return (
    <div
      ref={stripRef}
      role='toolbar'
      aria-label='チャンネルクイックジャンプ'
      className='flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden'
      onKeyDown={handleKeyDown}
    >
      {channels.map((ch) => {
        const isActive = ch.id === activeChannelId
        return (
          <button
            key={ch.id}
            type='button'
            onClick={() => onChipClick(ch.id)}
            aria-pressed={isActive}
            aria-label={`${ch.channelNumber} ${ch.name}へジャンプ`}
            className={cn(
              'inline-flex flex-shrink-0 items-center rounded-status border font-mono font-bold uppercase tracking-status',
              'gap-[3px] px-1.5 py-[3px] text-[0.5625rem] leading-none',
              'cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isActive
                ? 'border-primary bg-primary/12 text-foreground'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {ch.channelNumber}
          </button>
        )
      })}
    </div>
  )
}

// ─── Mobile agenda view (virtualised sections) ─────────────────────────────────

interface AgendaViewProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  now: Date
  windowEnd: Date
  /** Ref forwarded from the scrollable parent to wire the virtualizer. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  onActiveSectionChange: (channelId: string | null) => void
  onProgramSelect: (program: Program) => void
}

function AgendaView({
  channels,
  programsByChannel,
  loadingChannelIds,
  now,
  windowEnd,
  scrollRef,
  onActiveSectionChange,
  onProgramSelect
}: AgendaViewProps) {
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const ch = channels[index]
      if (!ch) return AGENDA_SECTION_ESTIMATE
      const programs = programsByChannel.get(ch.id) ?? []
      const visible = programs.filter((p) => new Date(p.endAt) > now && new Date(p.startAt) < windowEnd)
      const programRows = visible.length === 0 ? 1 : visible.length
      return 32 + programRows * 64
    },
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()

  // IntersectionObserver: track topmost visible section header for chip active state
  useEffect(() => {
    const container = scrollRef.current
    if (!container || channels.length === 0) return

    const headers = new Map<Element, string>()
    for (const [id, el] of sectionRefs.current.entries()) {
      const header = el.querySelector('[data-section-header]')
      if (header) headers.set(header, id)
    }

    if (headers.size === 0) return

    let topMost: { channelId: string; top: number } | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const channelId = headers.get(entry.target)
          if (!channelId) continue
          if (entry.isIntersecting) {
            const top = entry.boundingClientRect.top
            if (topMost === null || top < topMost.top) {
              topMost = { channelId, top }
              onActiveSectionChange(channelId)
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0
      }
    )

    for (const el of headers.keys()) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [channels, scrollRef, onActiveSectionChange])

  return (
    <div style={{ height: totalHeight, position: 'relative' }}>
      {virtualRows.map((virtualRow) => {
        const ch = channels[virtualRow.index]
        if (!ch) return null
        const rawPrograms = programsByChannel.get(ch.id) ?? []
        const programs = rawPrograms.filter((p) => new Date(p.endAt) > now && new Date(p.startAt) < windowEnd)
        const isLoading = loadingChannelIds.has(ch.id)

        return (
          <div
            key={ch.id}
            data-index={virtualRow.index}
            ref={(el) => {
              if (el) {
                sectionRefs.current.set(ch.id, el)
                rowVirtualizer.measureElement(el)
              } else {
                sectionRefs.current.delete(ch.id)
              }
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <section aria-label={ch.name}>
              {/* Section header — the sticky CSS still works because the parent
                  scroll container provides the sticky context. */}
              <div
                data-section-header
                data-channel-id={ch.id}
                className='sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5'
              >
                <span className='font-mono text-[0.6875rem] font-bold text-muted-foreground'>{ch.channelNumber}</span>
                <span className='text-[0.75rem] font-bold'>{ch.name}</span>
              </div>

              {isLoading ? (
                <div className='space-y-1 p-2'>
                  {[...Array(3)].map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
                    <Skeleton key={i} className='h-12 w-full rounded' />
                  ))}
                </div>
              ) : programs.length === 0 ? (
                <p className='px-3 py-2 text-[0.75rem] text-muted-foreground'>番組情報なし</p>
              ) : (
                <ul>
                  {programs.map((p) => {
                    const isNow = new Date(p.startAt) <= now && new Date(p.endAt) > now
                    const accentColor = genreToColor(p.genres[0] ?? '')
                    return (
                      <li key={p.id}>
                        <button
                          type='button'
                          onClick={() => onProgramSelect(p)}
                          aria-label={`${p.title} ${formatTimeRange(p.startAt, p.endAt)}`}
                          className={cn(
                            'flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left',
                            'transition-colors hover:bg-muted/30',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            isNow && 'bg-muted/20'
                          )}
                        >
                          <div
                            className='mt-[3px] w-[3px] flex-shrink-0 self-stretch rounded-full'
                            style={{ background: accentColor }}
                            aria-hidden
                          />

                          <div className='flex flex-1 flex-col gap-[2px]'>
                            <div className='flex items-center gap-1.5'>
                              {isNow && (
                                <StatusChip variant='live' dot size='sm'>
                                  ON AIR
                                </StatusChip>
                              )}
                              <span className='font-mono text-[0.625rem] tabular-nums text-muted-foreground'>
                                {formatTimeRange(p.startAt, p.endAt)}
                              </span>
                            </div>
                            <span className='text-[0.8125rem] font-bold leading-[1.3]'>{p.title}</span>
                            <div className='mt-[2px] flex flex-wrap gap-1'>
                              {p.genres[0] && (
                                <StatusChip variant='muted' size='sm'>
                                  {p.genres[0]}
                                </StatusChip>
                              )}
                              {p.isRecordable && (
                                <StatusChip variant='sched' size='sm'>
                                  予約
                                </StatusChip>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )
      })}
    </div>
  )
}

// ─── Public component ──────────────────────────────────────────────────────────

export function EPGGrid({
  channels,
  programsByChannel,
  loadingChannelIds,
  gridStartAt,
  highlightChannelId
}: EPGGridProps) {
  const now = useClock()
  const gridEnd = useMemo(() => addHours(gridStartAt, GRID_HOURS), [gridStartAt])
  const agendaScrollRef = useRef<HTMLDivElement>(null)

  const [activeChannelId, setActiveChannelId] = useState<string | null>(highlightChannelId ?? channels[0]?.id ?? null)
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)

  // Jump to the section whose id matches channelId
  const handleChipClick = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId)
      const container = agendaScrollRef.current
      if (!container) return
      // Find the section header in the DOM. If the section is not yet rendered
      // (virtualizer hasn't mounted it), scroll by index approximation.
      const header = container.querySelector<HTMLElement>(`[data-section-header][data-channel-id="${channelId}"]`)
      if (header) {
        header.scrollIntoView({ block: 'start', behavior: 'smooth' })
      } else {
        const idx = channels.findIndex((c) => c.id === channelId)
        if (idx >= 0) {
          container.scrollTo({ top: idx * AGENDA_SECTION_ESTIMATE, behavior: 'smooth' })
        }
      }
    },
    [channels]
  )

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* ── Mobile: channel quick-jump strip (above agenda) ── */}
      <div className='shrink-0 border-b border-border bg-card md:hidden'>
        <ChannelChipStrip channels={channels} activeChannelId={activeChannelId} onChipClick={handleChipClick} />
      </div>

      {/* ── Desktop: future schedule grid (md+) ── */}
      <div className='hidden flex-1 overflow-hidden md:flex md:flex-col'>
        <div className='shrink-0 border-b border-border bg-muted/50 px-3 py-1'>
          <span className='text-[0.65rem] font-bold uppercase tracking-[0.06em] text-muted-foreground'>
            これからの番組（{format(gridStartAt, 'HH:mm')} 〜 {format(gridEnd, 'HH:mm')}）
          </span>
        </div>
        <div className='flex-1 overflow-hidden'>
          <FutureGrid
            channels={channels}
            programsByChannel={programsByChannel}
            loadingChannelIds={loadingChannelIds}
            gridStart={gridStartAt}
            gridEnd={gridEnd}
            now={now}
            onProgramSelect={setSelectedProgram}
          />
        </div>
      </div>

      {/* ── Mobile: agenda view (<md) ── */}
      <div ref={agendaScrollRef} className='flex-1 overflow-y-auto md:hidden'>
        <AgendaView
          channels={channels}
          programsByChannel={programsByChannel}
          loadingChannelIds={loadingChannelIds}
          now={now}
          windowEnd={gridEnd}
          scrollRef={agendaScrollRef}
          onActiveSectionChange={setActiveChannelId}
          onProgramSelect={setSelectedProgram}
        />
      </div>

      <ProgramDetailDialog
        program={selectedProgram}
        open={selectedProgram !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProgram(null)
        }}
      />
    </div>
  )
}
