/**
 * EPGGrid — virtualised implementation.
 *
 * Desktop (md+): pinned NOW-strip + 2-axis future grid with row-virtualisation
 *   via @tanstack/react-virtual. Horizontal axis is NOT virtualised because each
 *   row holds at most 48 absolutely-positioned cells (24 h / 30 min) — cheap.
 *
 * Mobile (<md):
 *   - Channel quick-jump strip (horizontally scrollable chips) below NOW-strip.
 *     IntersectionObserver tracks the topmost visible section to highlight the
 *     active chip.
 *   - Agenda view with per-section virtualisation.
 *     Sections are variable-height groups (header + N program rows). We use a
 *     single virtualizer whose item count == channels.length and whose
 *     estimateSize accounts for the header + typical program list height.
 *     The actual DOM height is always set via getTotalSize() so the scrollbar
 *     is accurate, and each item is positioned with translateY.
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

/** Pixels per minute in the future grid. 3px/min = 180px/hour, 90px per 30-min slot. */
const PX_PER_MIN = 3

/** Channel label column width in px (sticky left). */
const CH_COL_W = 80

/** Number of hours shown in the future grid. */
const GRID_HOURS = 8

/** Row height for the future grid (px). Fixed — no measureElement needed. */
const ROW_H = 80

/** Estimated height for one agenda section: header (32) + ~4 programs × 72px. */
const AGENDA_SECTION_ESTIMATE = 32 + 4 * 72

interface EPGGridProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  /** ISO string marking the left edge of the future grid (typically next half-hour boundary). */
  gridStartAt: Date
  /** ISO string for the highlighted channel (from ?channel= search param). */
  highlightChannelId?: string | undefined
}

// ─── NOW-strip ────────────────────────────────────────────────────────────────

// ─── Future grid helpers ───────────────────────────────────────────────────────

function clipPrograms(programs: Program[], gridStart: Date, gridEnd: Date): Program[] {
  return programs.filter((p) => new Date(p.endAt) > gridStart && new Date(p.startAt) < gridEnd)
}

function dateToOffset(date: Date, gridStart: Date): number {
  return Math.max(0, (date.getTime() - gridStart.getTime()) / (60_000 / PX_PER_MIN))
}

function programWidth(program: Program, gridStart: Date, gridEnd: Date): number {
  const start = Math.max(new Date(program.startAt).getTime(), gridStart.getTime())
  const end = Math.min(new Date(program.endAt).getTime(), gridEnd.getTime())
  return Math.max(4, (end - start) / (60_000 / PX_PER_MIN))
}

// ─── Desktop future grid (virtualised rows) ────────────────────────────────────

interface FutureGridProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  gridStart: Date
  gridEnd: Date
  now: Date
}

function FutureGrid({ channels, programsByChannel, loadingChannelIds, gridStart, gridEnd, now }: FutureGridProps) {
  const totalWidth = GRID_HOURS * 60 * PX_PER_MIN
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
  const showIndicator = nowOffset > 0 && nowOffset < totalWidth

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 5
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalRowHeight = rowVirtualizer.getTotalSize()

  return (
    <section
      ref={scrollRef}
      aria-label='これからの番組グリッド'
      className='relative overflow-auto [scrollbar-width:thin]'
      style={{ height: '100%' }}
    >
      {/* Sticky time-header row */}
      <div className='sticky top-0 z-20 flex bg-card' style={{ paddingLeft: CH_COL_W }}>
        {/* Corner cell */}
        <div
          className='absolute left-0 top-0 z-30 flex items-center justify-center border-b border-r-2 border-border bg-card'
          style={{ width: CH_COL_W, height: 28 }}
        >
          <span className='font-mono text-[0.6875rem] font-bold text-muted-foreground'>CH</span>
        </div>

        {/* Time ticks */}
        <div className='relative border-b border-border' style={{ width: totalWidth, height: 28, flexShrink: 0 }}>
          {hourTicks.map((tick) => {
            const left = dateToOffset(tick, gridStart)
            return (
              <div
                key={tick.toISOString()}
                className='absolute top-0 flex h-full items-center border-l border-border/50 pl-1'
                style={{ left }}
              >
                <span className='font-mono text-[0.75rem] font-bold text-muted-foreground'>
                  {format(tick, 'HH:mm')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Virtualised channel rows — relative wrapper holds total height */}
      <div data-testid='future-grid-rows' style={{ height: totalRowHeight, position: 'relative' }}>
        {virtualRows.map((virtualRow) => {
          const ch = channels[virtualRow.index]
          if (!ch) return null
          const programs = clipPrograms(programsByChannel.get(ch.id) ?? [], gridStart, gridEnd)
          const isLoading = loadingChannelIds.has(ch.id)

          return (
            <div
              key={ch.id}
              data-row
              data-channel-id={ch.id}
              data-index={virtualRow.index}
              className='absolute flex w-full border-b border-border'
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                height: ROW_H
              }}
            >
              {/* Channel label — sticky left */}
              <button
                type='button'
                aria-label={ch.name}
                className={cn(
                  'sticky left-0 z-10 flex flex-shrink-0 flex-col items-center justify-center border-r-2 border-border bg-card px-1 py-1',
                  'cursor-pointer hover:bg-muted/50 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                )}
                style={{ width: CH_COL_W, height: ROW_H }}
              >
                <span className='font-mono text-[0.8125rem] font-bold' style={{ color: genreToColor('') }}>
                  {ch.channelNumber}
                </span>
                <span className='mt-[3px] text-center text-[0.625rem] leading-[1.2] text-muted-foreground'>
                  {ch.name.length > 6 ? `${ch.name.slice(0, 6)}…` : ch.name}
                </span>
              </button>

              {/* Programs row — absolutely positioned within relative container */}
              <div
                className='relative flex-1 bg-background'
                style={{ height: ROW_H, flexShrink: 0, minWidth: totalWidth }}
              >
                {isLoading ? (
                  <div className='absolute inset-0 flex items-center gap-2 px-2'>
                    <Skeleton className='h-8 w-full rounded' />
                  </div>
                ) : programs.length === 0 ? (
                  <div className='absolute inset-0 flex items-center px-2'>
                    <span className='text-[0.6rem] text-muted-foreground'>番組情報なし</span>
                  </div>
                ) : (
                  programs.map((p) => {
                    const left = dateToOffset(new Date(p.startAt), gridStart)
                    const width = programWidth(p, gridStart, gridEnd)
                    return (
                      <div key={p.id} className='absolute top-[4px] bottom-[4px] px-[2px]' style={{ left, width }}>
                        <ProgramCell program={p} className='h-full' />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Now indicator — destructive 2px vertical line.
          Positioned relative to the scroll container (not the virtualised rows)
          by using the 28px time-header offset + scrolled top.
          We let it span the full virtual height so it stays visible at all scroll positions. */}
      {showIndicator && (
        <div
          aria-hidden
          className='pointer-events-none absolute top-[28px] z-25 w-[2px] bg-destructive'
          style={{ left: CH_COL_W + nowOffset, height: totalRowHeight }}
        />
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
}

function AgendaView({
  channels,
  programsByChannel,
  loadingChannelIds,
  now,
  windowEnd,
  scrollRef,
  onActiveSectionChange
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
                        <Link
                          to='/live/$channelId'
                          params={{ channelId: ch.id }}
                          aria-label={`${p.title} ${formatTimeRange(p.startAt, p.endAt)}`}
                          className={cn(
                            'flex items-start gap-2 border-b border-border px-3 py-2',
                            'hover:bg-muted/30 transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            isNow && 'bg-muted/20'
                          )}
                        >
                          <div
                            className='mt-[3px] w-[3px] self-stretch flex-shrink-0 rounded-full'
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
                        </Link>
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
        />
      </div>
    </div>
  )
}
