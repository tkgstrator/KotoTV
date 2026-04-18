import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { useRef } from 'react'
import { HlsPlayer } from '@/components/player/HlsPlayer'
import { PlayerControls } from '@/components/player/PlayerControls'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import { useStream } from '@/hooks/useStream'
import { formatTimeRange, getProgress } from '@/lib/program'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/live/$channelId')({
  component: LivePage
})

const TYPE_LABEL: Record<string, string> = {
  GR: 'GR',
  BS: 'BS',
  CS: 'CS',
  SKY: 'SKY'
}

// Unified typography scale for the live page info surfaces.
// Only four sizes in play: 10px (micro: labels / log / section headers),
// 12px (value: diagnostic values, meta rows), 14px (channel name / error title),
// 17px (program title, the only "large" anchor).
const SECTION_LABEL_CLS = 'font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] text-muted-foreground'
const STAT_LABEL_CLS = 'font-mono text-[0.625rem] tracking-[0.03em] text-muted-foreground'
const STAT_VAL_CLS = 'font-mono text-[0.75rem] font-semibold tabular-nums text-foreground'
const LOG_LINE_CLS = 'font-mono text-[0.625rem] leading-[1.6] text-muted-foreground'

function NowStrip({ channelId }: { channelId: string }) {
  const { data } = useChannels()
  const channel = data?.channels.find((c) => c.id === channelId)
  const cur = channel?.currentProgram ?? null
  const next = channel?.nextProgram ?? null

  const progress = cur ? getProgress(cur.startAt, cur.endAt) : 0
  const elapsed = cur ? Math.floor((Date.now() - new Date(cur.startAt).getTime()) / 60000) : 0
  const remaining = cur ? Math.ceil((new Date(cur.endAt).getTime() - Date.now()) / 60000) : 0
  const total = cur ? Math.round((new Date(cur.endAt).getTime() - new Date(cur.startAt).getTime()) / 60000) : 0

  const NOW_LABEL_CLS = `${SECTION_LABEL_CLS.replace('text-muted-foreground', 'text-destructive')} mb-1`

  if (!channel) {
    return (
      <div className='flex-shrink-0 border-b-2 border-border bg-card px-3 py-2.5'>
        <div className={NOW_LABEL_CLS}>NOW ON AIR</div>
        <Skeleton className='mb-2 h-[18px] w-60' />
        <Skeleton className='mb-2.5 h-[11px] w-40' />
        <Skeleton className='h-[5px] w-full rounded-sm' />
      </div>
    )
  }

  return (
    <div className='flex-shrink-0 border-b-2 border-border bg-card px-3 pb-3 pt-2.5'>
      <div className={cn('flex items-center gap-1.5', NOW_LABEL_CLS)}>
        <span aria-hidden='true' className='size-1.5 rounded-full bg-destructive animate-pulse' />
        NOW ON AIR
      </div>

      {cur ? (
        <>
          <div className='text-[1.0625rem] font-bold leading-[1.25] mb-1.5'>{cur.title}</div>
          <div className='flex flex-wrap items-center gap-2.5 font-mono text-[0.75rem] tabular-nums text-muted-foreground mb-2'>
            <span>{formatTimeRange(cur.startAt, cur.endAt)}</span>
            <span>残り {remaining}分</span>
            {next && (
              <span>
                次: {next.title} {format(new Date(next.startAt), 'HH:mm')}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className='text-[0.75rem] text-muted-foreground mb-2'>番組情報なし</div>
      )}

      <div
        role='progressbar'
        aria-label='番組経過'
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className='h-[5px] overflow-hidden rounded-[2px] bg-muted'
      >
        <div
          className='h-full rounded-[2px] bg-primary transition-[width] duration-1000'
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      {cur && (
        <div className={cn('mt-1 flex justify-between tabular-nums', STAT_LABEL_CLS)}>
          <span>経過 {elapsed}分</span>
          <span>
            残り {remaining}分 / {total}分
          </span>
        </div>
      )}
    </div>
  )
}

function DiagnosticSidebar({ sessionId, streamStatus }: { sessionId: string | undefined; streamStatus: string }) {
  const now = format(new Date(), 'HH:mm:ss')
  const shortId = sessionId ? `${sessionId.slice(0, 8)}…` : '—'

  const statusVariant = streamStatus === 'ready' ? 'ok' : streamStatus === 'error' ? 'err' : 'info'
  const statusLabel =
    streamStatus === 'ready' ? 'OK' : streamStatus === 'starting' ? 'INIT' : streamStatus === 'error' ? 'ERR' : 'IDLE'

  return (
    <aside
      aria-label='診断情報パネル'
      className={cn(
        'flex flex-col overflow-hidden bg-card',
        'w-full border-t border-border',
        'lg:w-[240px] lg:flex-shrink-0 lg:border-l lg:border-t-0'
      )}
    >
      {/* STREAM section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>STREAM</SidebarSectionLabel>
        <StatRow label='status'>
          <StatusChip variant={statusVariant} size='sm'>
            {statusLabel}
          </StatusChip>
        </StatRow>
        <StatRow label='codec'>
          <span className={STAT_VAL_CLS}>HEVC / 1080p60</span>
        </StatRow>
        <StatRow label='hw_accel'>
          <span className={STAT_VAL_CLS}>FFmpeg → stub</span>
        </StatRow>
        <StatRow label='bitrate'>
          <span className={STAT_VAL_CLS}>— Mbps</span>
        </StatRow>
        <StatRow label='latency'>
          <span className={STAT_VAL_CLS}>—</span>
        </StatRow>
      </div>

      {/* HLS section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>HLS</SidebarSectionLabel>
        <StatRow label='segment'>
          <span className={STAT_VAL_CLS}>—</span>
        </StatRow>
        <StatRow label='buffer'>
          <span className={STAT_VAL_CLS}>—</span>
        </StatRow>
        <StatRow label='dropped_f'>
          <span className={STAT_VAL_CLS}>0</span>
        </StatRow>
      </div>

      {/* SESSION section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>SESSION</SidebarSectionLabel>
        <StatRow label='viewers'>
          <span className={STAT_VAL_CLS}>1</span>
        </StatRow>
        <StatRow label='session_id'>
          <span className={cn(STAT_VAL_CLS, 'opacity-70')}>{shortId}</span>
        </StatRow>
        <StatRow label='started'>
          <span className={STAT_VAL_CLS}>{now}</span>
        </StatRow>
      </div>

      {/* LOG section */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <div className='border-b border-border px-3 pb-1 pt-2'>
          <SidebarSectionLabel>LOG</SidebarSectionLabel>
        </div>
        <div className='flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]'>
          <LogLine ts='--:--:--' level='info'>
            [session] initializing…
          </LogLine>
          {sessionId && (
            <LogLine ts={now} level='info'>
              [api] POST /api/streams/live → 201
            </LogLine>
          )}
          {streamStatus === 'ready' && (
            <>
              <LogLine ts={now} level='ok'>
                [stream] session acquired
              </LogLine>
              <LogLine ts={now} level='info'>
                [hls] waiting for playlist…
              </LogLine>
            </>
          )}
          {streamStatus === 'error' && (
            <LogLine ts={now} level='err'>
              [stream] start failed
            </LogLine>
          )}
        </div>
      </div>
    </aside>
  )
}

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('mb-2 flex items-center gap-1.5', SECTION_LABEL_CLS)}>
      {children}
      <span aria-hidden='true' className='flex-1 h-px bg-border' />
    </div>
  )
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between py-[3px]'>
      <span className={STAT_LABEL_CLS}>{label}</span>
      {children}
    </div>
  )
}

function LogLine({ ts, level, children }: { ts: string; level: 'ok' | 'err' | 'info'; children: React.ReactNode }) {
  const levelClass = level === 'ok' ? 'text-green-500' : level === 'err' ? 'text-destructive' : 'text-primary'
  return (
    <div className={cn('flex items-baseline gap-1.5 py-[1px]', LOG_LINE_CLS)}>
      <span className='shrink-0 opacity-55'>{ts}</span>
      <span className={levelClass}>{children}</span>
    </div>
  )
}

function LivePage() {
  const { channelId } = Route.useParams()
  const stream = useStream(channelId)
  const videoRef = useRef<HTMLVideoElement>(null)

  const { data: channelsData } = useChannels()
  const channel = channelsData?.channels.find((c) => c.id === channelId)

  const typeLabel = channel ? (TYPE_LABEL[channel.type] ?? channel.type) : null

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* App bar */}
      <header className='flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3'>
        <Link
          to='/'
          aria-label='チャンネルリストへ戻る'
          className='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
        >
          <Button variant='ghost' size='icon' className='h-8 w-8' asChild>
            <span aria-hidden>
              <ChevronLeft className='size-5' />
            </span>
          </Button>
        </Link>

        {typeLabel && (
          <StatusChip variant='info' size='sm'>
            {typeLabel}
          </StatusChip>
        )}

        <span className='flex-1 truncate text-[0.875rem] font-bold'>
          {channel?.name ?? channelId}
          {channel?.channelNumber && (
            <span className='ml-1 text-[0.75rem] font-normal text-muted-foreground'>{channel.channelNumber}</span>
          )}
        </span>

        <div className='flex items-center gap-1.5'>
          {stream.status === 'ready' ? (
            <>
              <StatusChip variant='live' dot size='sm'>
                LIVE
              </StatusChip>
              <StatusChip variant='ok' size='sm'>
                OK
              </StatusChip>
            </>
          ) : stream.status === 'error' ? (
            <StatusChip variant='fatal' size='sm'>
              FATAL
            </StatusChip>
          ) : (
            <StatusChip variant='info' size='sm'>
              INIT
            </StatusChip>
          )}
        </div>

        <span className='font-mono text-[0.75rem] font-semibold tabular-nums text-muted-foreground'>
          {format(new Date(), 'HH:mm:ss')}
        </span>
      </header>

      {/* NOW-strip */}
      <NowStrip channelId={channelId} />

      {/* Main area: video column + diagnostic sidebar */}
      <div className='flex flex-1 overflow-hidden flex-col lg:flex-row'>
        {/* Video column */}
        <div className='flex flex-1 flex-col overflow-hidden bg-[hsl(222_30%_6%)]'>
          {stream.status === 'error' ? (
            /* Fatal error state */
            <div className='flex flex-1 items-center justify-center p-6 bg-[hsl(222_30%_5%)]'>
              <div
                role='alert'
                className='max-w-[480px] rounded-md border border-border border-l-[3px] border-l-destructive bg-card p-4'
              >
                <div className='flex items-center gap-2 mb-2.5'>
                  <StatusChip variant='fatal' size='sm'>
                    FATAL
                  </StatusChip>
                  <span className='text-[0.875rem] font-bold'>ストリームを開始できませんでした</span>
                </div>
                <p className='mb-3 text-[0.75rem] text-muted-foreground'>{stream.error?.message ?? '不明なエラー'}</p>
                <div className='mb-3 max-h-[120px] overflow-y-auto rounded border border-border bg-background p-2'>
                  <LogLine ts={format(new Date(), 'HH:mm:ss.SSS')} level='err'>
                    [stream] {stream.error?.message ?? 'start failed'}
                  </LogLine>
                </div>
                <div className='flex gap-2'>
                  <Link to='/live/$channelId' params={{ channelId }}>
                    <Button size='sm'>再試行</Button>
                  </Link>
                  <Link to='/'>
                    <Button variant='outline' size='sm'>
                      チャンネルリストへ
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : stream.status === 'starting' || stream.status === 'idle' ? (
            /* Loading state */
            <div className='flex flex-1 flex-col items-center justify-center gap-3 bg-[hsl(222_30%_5%)]'>
              <div
                role='status'
                className='h-9 w-9 rounded-full border-[2.5px] border-muted border-t-primary animate-spin'
              >
                <span className='sr-only'>ストリーム準備中</span>
              </div>
              <StatusChip variant='info' size='sm'>
                INIT — HLS セグメントを生成中
              </StatusChip>
            </div>
          ) : (
            /* Ready: actual player */
            <div
              className='flex flex-1 items-center justify-center bg-[hsl(222_30%_5%)]'
              role='application'
              aria-label='ライブ映像プレイヤー'
            >
              <HlsPlayer
                ref={videoRef}
                playlistUrl={stream.playlistUrl ?? ''}
                ariaLabel={`${channel?.name ?? channelId} ライブ映像`}
                className='max-h-full max-w-full'
                onError={(err) => console.error('[HlsPlayer]', err)}
              />
            </div>
          )}

          {/* Controls bar — always present below video */}
          <PlayerControls isLive videoRef={videoRef} />
        </div>

        {/* Diagnostic sidebar */}
        <DiagnosticSidebar sessionId={stream.sessionId} streamStatus={stream.status} />
      </div>
    </div>
  )
}
