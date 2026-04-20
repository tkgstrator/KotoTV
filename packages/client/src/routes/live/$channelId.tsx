import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { Activity, ChevronLeft } from 'lucide-react'
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { UpNextPanel } from '@/components/live/UpNextPanel'
import { HlsPlayer } from '@/components/player/HlsPlayer'
import { PlayerControls } from '@/components/player/PlayerControls'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useChannels } from '@/hooks/useChannels'
import { useStream } from '@/hooks/useStream'
import { useStreamInfo } from '@/hooks/useStreamInfo'
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

function DiagnosticSidebar({
  sessionId,
  streamStatus,
  videoRef
}: {
  sessionId: string | undefined
  streamStatus: string
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  // 8-char prefix is enough to disambiguate sessions (UUIDv4 collision at
  // that width is astronomically unlikely). Dropping the trailing ellipsis
  // keeps the cell from wrapping in the narrow 240 px sidebar.
  const shortId = sessionId ? sessionId.slice(0, 8) : '—'
  const info = useStreamInfo(sessionId)

  const [bufferSec, setBufferSec] = useState<number | null>(null)

  // Snapshot the timestamp of each log-worthy state transition exactly once
  // so the rendered "HH:MM:SS" does not tick forward every second.
  const [logTimestamps, setLogTimestamps] = useState<{
    api?: string
    acquired?: string
    error?: string
  }>({})

  useEffect(() => {
    if (sessionId && !logTimestamps.api) {
      setLogTimestamps((prev) => ({ ...prev, api: format(new Date(), 'HH:mm:ss') }))
    }
  }, [sessionId, logTimestamps.api])

  useEffect(() => {
    if (streamStatus === 'ready' && !logTimestamps.acquired) {
      setLogTimestamps((prev) => ({ ...prev, acquired: format(new Date(), 'HH:mm:ss') }))
    }
    if (streamStatus === 'error' && !logTimestamps.error) {
      setLogTimestamps((prev) => ({ ...prev, error: format(new Date(), 'HH:mm:ss') }))
    }
  }, [streamStatus, logTimestamps.acquired, logTimestamps.error])

  // Client-side buffer measurement is more accurate than the server-estimated value.
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current
      if (v && v.buffered.length > 0) {
        setBufferSec(v.buffered.end(v.buffered.length - 1) - v.currentTime)
      }
    }
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [videoRef])

  const statusVariant = streamStatus === 'ready' ? 'ok' : streamStatus === 'error' ? 'err' : 'info'
  const statusLabel =
    streamStatus === 'ready' ? 'OK' : streamStatus === 'starting' ? 'INIT' : streamStatus === 'error' ? 'ERR' : 'IDLE'

  const codecDisplay = info ? info.codec.toUpperCase() : '—'
  const resolutionDisplay = info?.resolution ?? '—'
  const bitrateDisplay = info ? `${(info.bitrate / 1000).toFixed(1)} Mbps` : '— Mbps'
  const fpsDisplay = info ? info.fps.toFixed(0) : '—'
  const hwAccelDisplay = info?.hwAccel ?? '—'
  const viewersDisplay = info?.viewerCount ?? 1
  const droppedDisplay = info?.droppedFrames ?? 0
  const bufferDisplay = bufferSec !== null ? `${bufferSec.toFixed(1)}s` : '—'

  return (
    <section aria-label='診断情報パネル' className='flex h-full flex-col overflow-hidden bg-card'>
      {/* STREAM section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>STREAM</SidebarSectionLabel>
        <StatRow label='status'>
          <StatusChip variant={statusVariant} size='sm'>
            {statusLabel}
          </StatusChip>
        </StatRow>
        <StatRow label='codec'>
          <span className={STAT_VAL_CLS}>{codecDisplay}</span>
        </StatRow>
        <StatRow label='resolution'>
          <span className={STAT_VAL_CLS}>{resolutionDisplay}</span>
        </StatRow>
        <StatRow label='hw_accel'>
          <span className={STAT_VAL_CLS}>{hwAccelDisplay}</span>
        </StatRow>
        <StatRow label='bitrate'>
          <span className={STAT_VAL_CLS}>{bitrateDisplay}</span>
        </StatRow>
        <StatRow label='fps'>
          <span className={STAT_VAL_CLS}>{fpsDisplay}</span>
        </StatRow>
      </div>

      {/* HLS section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>HLS</SidebarSectionLabel>
        <StatRow label='segment'>
          <span className={STAT_VAL_CLS}>—</span>
        </StatRow>
        <StatRow label='buffer'>
          <span className={STAT_VAL_CLS}>{bufferDisplay}</span>
        </StatRow>
        <StatRow label='dropped_f'>
          <span className={STAT_VAL_CLS}>{droppedDisplay}</span>
        </StatRow>
      </div>

      {/* SESSION section */}
      <div className='border-b border-border px-3 py-2.5'>
        <SidebarSectionLabel>SESSION</SidebarSectionLabel>
        <StatRow label='viewers'>
          <span className={STAT_VAL_CLS}>{viewersDisplay}</span>
        </StatRow>
        <StatRow label='session_id'>
          <span className={cn(STAT_VAL_CLS, 'opacity-70')}>{shortId}</span>
        </StatRow>
        <StatRow label='started'>
          <span className={STAT_VAL_CLS}>{logTimestamps.api ?? '—'}</span>
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
          {sessionId && logTimestamps.api && (
            <LogLine ts={logTimestamps.api} level='info'>
              [api] POST /api/streams/live → 201
            </LogLine>
          )}
          {streamStatus === 'ready' && logTimestamps.acquired && (
            <>
              <LogLine ts={logTimestamps.acquired} level='ok'>
                [stream] session acquired
              </LogLine>
              <LogLine ts={logTimestamps.acquired} level='info'>
                [hls] waiting for playlist…
              </LogLine>
            </>
          )}
          {streamStatus === 'error' && logTimestamps.error && (
            <LogLine ts={logTimestamps.error} level='err'>
              [stream] start failed
            </LogLine>
          )}
        </div>
      </div>
    </section>
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
    <div className='flex items-center justify-between gap-2 py-[3px]'>
      <span className={cn(STAT_LABEL_CLS, 'shrink-0')}>{label}</span>
      <span className='min-w-0 truncate text-right'>{children}</span>
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
  const [codec, setCodec] = useState<'avc' | 'hevc'>('avc')
  const [quality, setQuality] = useState<'low' | 'mid' | 'high'>('mid')
  const stream = useStream({ type: 'live', channelId, codec, quality })
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

        {/* Diagnostic panel toggle — hidden by default; power users open it on demand */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant='ghost' size='icon' className='h-8 w-8' aria-label='動画情報を表示'>
              <Activity className='size-4' />
            </Button>
          </SheetTrigger>
          <SheetContent side='right' className='w-[280px] p-0 sm:max-w-[280px]'>
            <SheetHeader className='sr-only'>
              <SheetTitle>動画情報</SheetTitle>
            </SheetHeader>
            <DiagnosticSidebar sessionId={stream.sessionId} streamStatus={stream.status} videoRef={videoRef} />
          </SheetContent>
        </Sheet>
      </header>

      {/* Main area: video column + UpNext rail (YouTube-style).
          12 px breathing room on all sides so the player doesn't collide
          with the shell chrome or the viewport edge. 16 px gap between
          the two columns. Capped at 1784 px and centered so ultra-wide
          monitors don't stretch the video beyond YouTube's own max-width. */}
      <div className='mx-auto flex w-full flex-1 flex-col overflow-hidden lg:max-w-[1784px] lg:flex-row lg:gap-4 lg:p-3'>
        {/* Video column */}
        <div className='flex flex-1 flex-col overflow-hidden lg:min-w-0'>
          {stream.status === 'error' ? (
            /* Fatal error state */
            <div className='flex flex-1 items-center justify-center p-6'>
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
            <div className='flex flex-1 flex-col items-center justify-center gap-3'>
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
            /* Ready: actual player. aspect-video forces the well to 16:9
               so the video sits flush against PlayerControls below — no
               letterbox padding, no flex-grow gap. YouTube does the same. */
            <div className='aspect-video w-full' role='application' aria-label='ライブ映像プレイヤー'>
              <HlsPlayer
                key={stream.sessionId}
                ref={videoRef}
                playlistUrl={stream.playlistUrl ?? ''}
                ariaLabel={`${channel?.name ?? channelId} ライブ映像`}
                className='h-full w-full'
                onError={(err) => console.error('[HlsPlayer]', err)}
              />
            </div>
          )}

          {/* Controls bar — always present below video */}
          <PlayerControls
            isLive
            videoRef={videoRef}
            codec={codec}
            onCodecChange={setCodec}
            quality={quality}
            onQualityChange={setQuality}
          />
        </div>

        {/* Up-next rail for the current channel (lg+ only — stacks below on
            mobile). 402 px matches YouTube's secondary column width. */}
        <div className='hidden shrink-0 lg:block lg:w-[402px]'>
          <UpNextPanel channelId={channelId} />
        </div>
      </div>
    </div>
  )
}
