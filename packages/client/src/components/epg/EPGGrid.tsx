/**
 * EPGGrid — non-virtualised CSS Grid implementation (Phase 3).
 * Virtualisation is intentionally deferred; the DOM structure here is
 * designed so each cell is fully independent, making it straightforward to
 * wrap rows in a row-virtualiser in a future round without touching cell logic.
 *
 * Desktop (md+): pinned NOW-strip (horizontal scroll) + 2-axis future grid
 * Mobile (<md):  agenda view — per-channel sections with chronological list
 *
 * Both layouts are rendered in DOM simultaneously and toggled via Tailwind's
 * responsive `hidden`/`block` utilities to avoid layout jumps on resize.
 */

import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { Link } from '@tanstack/react-router'
import { addHours, format, startOfHour } from 'date-fns'
import { Play } from 'lucide-react'
import { useMemo } from 'react'
import { StatusChip } from '@/components/shared/status-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { useClock } from '@/hooks/useClock'
import { formatTimeRange, genreToColor, getProgress } from '@/lib/program'
import { cn } from '@/lib/utils'
import { ProgramCell } from './ProgramCell'

/** Pixels per minute in the future grid. 2px/min = 120px/hour. */
const PX_PER_MIN = 2

/** Channel label column width in px (sticky left). */
const CH_COL_W = 68

/** Number of hours shown in the future grid. */
const GRID_HOURS = 8

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

interface NowCardProps {
  channel: Channel
  program: Program | null
  now: Date
  highlighted: boolean
}

function NowCard({ channel, program, now, highlighted }: NowCardProps) {
  const accentColor = program ? genreToColor(program.genres[0] ?? '') : 'oklch(0.55 0.04 247)'
  const progress = program ? getProgress(program.startAt, program.endAt, now.getTime()) : 0
  const remaining = program ? Math.max(0, Math.ceil((new Date(program.endAt).getTime() - now.getTime()) / 60_000)) : 0

  return (
    <li
      className={cn(
        'relative flex w-[160px] flex-shrink-0 scroll-ml-4 snap-start flex-col rounded-md border p-2',
        'bg-background transition-colors list-none',
        highlighted && 'ring-2 ring-ring ring-offset-1'
      )}
      style={{
        borderColor: `color-mix(in oklch, ${accentColor} 40%, transparent)`,
        borderLeftWidth: '3px',
        borderLeftColor: accentColor
      }}
    >
      <span className='mb-[3px] text-[0.6rem] font-semibold text-muted-foreground'>
        {channel.channelNumber} {channel.name}
      </span>

      {program ? (
        <>
          <span className='line-clamp-2 text-[0.75rem] font-bold leading-[1.3]'>{program.title}</span>
          <span className='mt-[3px] font-mono text-[0.6rem] tabular-nums text-muted-foreground'>
            {formatTimeRange(program.startAt, program.endAt)} · 残り{remaining}分
          </span>
          <div
            role='progressbar'
            aria-label='番組経過'
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className='mt-1.5 h-[3px] overflow-hidden rounded-full bg-border'
          >
            <div
              className='h-full rounded-full transition-[width] duration-1000'
              style={{ width: `${Math.round(progress * 100)}%`, background: accentColor }}
            />
          </div>
        </>
      ) : (
        <span className='text-[0.7rem] text-muted-foreground'>番組情報なし</span>
      )}

      <Link
        to='/live/$channelId'
        params={{ channelId: channel.id }}
        aria-label={`${channel.name}を視聴`}
        className={cn(
          'mt-1.5 flex w-full items-center justify-center gap-1 rounded py-1',
          'text-[0.65rem] font-bold text-[oklch(0.98_0.002_247)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'hover:opacity-85 transition-opacity'
        )}
        style={{ background: accentColor }}
      >
        <Play className='size-[9px]' aria-hidden />
        今すぐ視聴
      </Link>
    </li>
  )
}

// ─── Future grid helpers ───────────────────────────────────────────────────────

/** Returns programs for a channel clipped to [gridStartAt, gridEndAt). */
function clipPrograms(programs: Program[], gridStart: Date, gridEnd: Date): Program[] {
  return programs.filter((p) => new Date(p.endAt) > gridStart && new Date(p.startAt) < gridEnd)
}

/** Converts a Date into a left-offset px value relative to gridStartAt. */
function dateToOffset(date: Date, gridStart: Date): number {
  return Math.max(0, (date.getTime() - gridStart.getTime()) / (60_000 / PX_PER_MIN))
}

/** Width in px for a program segment. */
function programWidth(program: Program, gridStart: Date, gridEnd: Date): number {
  const start = Math.max(new Date(program.startAt).getTime(), gridStart.getTime())
  const end = Math.min(new Date(program.endAt).getTime(), gridEnd.getTime())
  return Math.max(4, (end - start) / (60_000 / PX_PER_MIN))
}

// ─── Desktop future grid ───────────────────────────────────────────────────────

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

  // Build hour tick marks
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

  return (
    /* The outer wrapper is scrollable on both axes. CH_COL_W sticky column
     * stays in place, time header row sticks to top-0 within this container.
     * Using overflow-auto here (not on a parent) keeps the sticky contexts
     * correct for both axes simultaneously. */
    <section aria-label='これからの番組グリッド' className='relative overflow-auto [scrollbar-width:thin]'>
      {/* Sticky time-header row */}
      <div className='sticky top-0 z-20 flex bg-card' style={{ paddingLeft: CH_COL_W }}>
        {/* Corner cell */}
        <div
          className='absolute left-0 top-0 z-30 flex items-center justify-center border-b border-r-2 border-border bg-card'
          style={{ width: CH_COL_W, height: 28 }}
        >
          <span className='font-mono text-[0.6rem] font-bold text-muted-foreground'>CH</span>
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
                <span className='font-mono text-[0.65rem] font-bold text-muted-foreground'>
                  {format(tick, 'HH:mm')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Channel rows */}
      <div>
        {channels.map((ch) => {
          const programs = clipPrograms(programsByChannel.get(ch.id) ?? [], gridStart, gridEnd)
          const isLoading = loadingChannelIds.has(ch.id)

          return (
            <div key={ch.id} className='flex border-b border-border'>
              {/* Channel label — sticky left */}
              <button
                type='button'
                aria-label={ch.name}
                className={cn(
                  'sticky left-0 z-10 flex flex-shrink-0 flex-col items-center justify-center border-r-2 border-border bg-card px-1 py-1',
                  'cursor-pointer hover:bg-muted/50 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                )}
                style={{ width: CH_COL_W, minHeight: 56 }}
              >
                <span className='font-mono text-[0.65rem] font-bold' style={{ color: genreToColor('') }}>
                  {ch.channelNumber}
                </span>
                <span className='mt-[2px] text-center text-[0.55rem] leading-[1.2] text-muted-foreground'>
                  {ch.name.length > 6 ? `${ch.name.slice(0, 6)}…` : ch.name}
                </span>
              </button>

              {/* Programs row — absolutely positioned within relative container */}
              <div className='relative bg-background' style={{ width: totalWidth, minHeight: 56, flexShrink: 0 }}>
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

      {/* Now indicator — destructive 2px vertical line */}
      {showIndicator && (
        <div
          aria-hidden
          className='pointer-events-none absolute top-[28px] bottom-0 z-25 w-[2px] bg-destructive'
          style={{ left: CH_COL_W + nowOffset }}
        />
      )}
    </section>
  )
}

// ─── Mobile agenda view ────────────────────────────────────────────────────────

interface AgendaViewProps {
  channels: Channel[]
  programsByChannel: Map<string, Program[]>
  loadingChannelIds: Set<string>
  now: Date
  windowEnd: Date
}

function AgendaView({ channels, programsByChannel, loadingChannelIds, now, windowEnd }: AgendaViewProps) {
  return (
    <div>
      {channels.map((ch) => {
        const rawPrograms = programsByChannel.get(ch.id) ?? []
        const programs = rawPrograms.filter((p) => new Date(p.endAt) > now && new Date(p.startAt) < windowEnd)
        const isLoading = loadingChannelIds.has(ch.id)

        return (
          <section key={ch.id} aria-label={ch.name}>
            {/* Channel section header */}
            <div className='sticky top-page-header z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5'>
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
                        {/* Genre accent bar */}
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

  // Current programs for the NOW-strip (one per channel, currently airing)
  const nowPrograms = useMemo(() => {
    const map = new Map<string, Program | null>()
    for (const ch of channels) {
      const all = programsByChannel.get(ch.id) ?? []
      const current = all.find((p) => new Date(p.startAt) <= now && new Date(p.endAt) > now) ?? null
      map.set(ch.id, current)
    }
    return map
  }, [channels, programsByChannel, now])

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* ── NOW-strip (desktop + mobile) ── */}
      <section
        className='sticky top-0 z-30 shrink-0 border-b-2 border-border bg-card py-2'
        aria-label='現在放送中の番組'
      >
        <div className='flex items-center gap-1.5 px-4 pb-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.08em] text-destructive'>
          <span aria-hidden className='size-2 animate-pulse rounded-full bg-destructive' />
          ON AIR NOW — {format(now, 'HH:mm')}
        </div>
        <ul
          aria-label='現在放送中'
          className='flex gap-2 overflow-x-auto px-4 [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        >
          {channels.map((ch) => (
            <NowCard
              key={ch.id}
              channel={ch}
              program={nowPrograms.get(ch.id) ?? null}
              now={now}
              highlighted={ch.id === highlightChannelId}
            />
          ))}
        </ul>
      </section>

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
      <div className='flex-1 overflow-y-auto md:hidden'>
        <AgendaView
          channels={channels}
          programsByChannel={programsByChannel}
          loadingChannelIds={loadingChannelIds}
          now={now}
          windowEnd={gridEnd}
        />
      </div>
    </div>
  )
}
