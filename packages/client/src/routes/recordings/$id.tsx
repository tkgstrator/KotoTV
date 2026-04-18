import type { Recording } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ChevronLeft, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HlsPlayer } from '@/components/player/HlsPlayer'
import { PlayerControls } from '@/components/player/PlayerControls'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useClock } from '@/hooks/useClock'
import { useRecording } from '@/hooks/useRecordings'
import { useStream } from '@/hooks/useStream'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/recordings/$id')({
  component: RecordingPlayerPage
})

const STUB_CHAPTERS = [
  { seconds: 0, title: 'オープニング' },
  { seconds: 300, title: '本編開始' },
  { seconds: 1800, title: '後半' },
  { seconds: 3000, title: 'エンディング' }
]

const RESUME_KEY_PREFIX = 'kototv:resume:'

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function InlineIdentityStrip({ rec }: { rec: Recording }) {
  const dateLabel = rec.startedAt ? format(new Date(rec.startedAt), 'yyyy-MM-dd HH:mm') : '—'
  const durationLabel = rec.durationSec ? formatDuration(rec.durationSec) : null

  return (
    <div className='flex-shrink-0 border-t border-border bg-card'>
      {/* Title row */}
      <div className='flex items-center gap-2 px-3 py-2 border-b border-border/50'>
        <h1 className='flex-1 truncate text-[0.875rem] font-bold leading-snug font-sans'>{rec.title}</h1>
      </div>

      {/* Meta chips row */}
      <div className='flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <StatusChip variant='done' size='sm'>
          VOD
        </StatusChip>
        <StatusChip variant='muted' size='sm'>
          {rec.channelId}
        </StatusChip>
        <StatusChip variant='muted' size='sm'>
          {dateLabel}
        </StatusChip>
        {durationLabel && (
          <StatusChip variant='muted' size='sm'>
            {durationLabel}
          </StatusChip>
        )}
        <StatusChip variant='muted' size='sm'>
          HEVC 1080p60
        </StatusChip>
        {rec.sizeBytes && (
          <StatusChip variant='muted' size='sm'>
            {(rec.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB
          </StatusChip>
        )}
      </div>
    </div>
  )
}

function ChapterPanel({
  videoRef,
  duration
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  duration: number
}) {
  const [currentSeconds, setCurrentSeconds] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const tick = () => setCurrentSeconds(Math.floor(v.currentTime))
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [videoRef])

  const activeIdx = STUB_CHAPTERS.reduce((acc, ch, idx) => {
    if (currentSeconds >= ch.seconds) return idx
    return acc
  }, 0)

  const seekTo = (seconds: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = duration > 0 ? Math.min(seconds, duration) : seconds
    v.play().catch(() => {})
  }

  return (
    <aside
      aria-label='チャプター'
      className={cn(
        'flex flex-col overflow-hidden bg-card',
        'w-full border-t border-border',
        'lg:w-[260px] lg:flex-shrink-0 lg:border-l lg:border-t-0'
      )}
    >
      <div className='flex items-center justify-between border-b border-border px-3 py-2 flex-shrink-0'>
        <span className='font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground'>
          チャプター
        </span>
        <StatusChip variant='muted' size='sm'>
          {STUB_CHAPTERS.length} 件 · 候補
        </StatusChip>
      </div>

      <ul className='flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm'>
        {STUB_CHAPTERS.map((ch, idx) => {
          const isActive = idx === activeIdx
          return (
            <li key={ch.seconds} className='border-b border-border/60'>
              <button
                type='button'
                aria-current={isActive ? 'true' : undefined}
                tabIndex={0}
                onClick={() => seekTo(ch.seconds)}
                className={cn(
                  'grid w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-muted/50',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  'grid-cols-[54px_1fr_10px] items-center gap-2',
                  isActive && 'bg-primary/10 border-l-[3px] border-l-primary pl-[9px]'
                )}
              >
                <span className='font-mono text-[0.625rem] tabular-nums text-muted-foreground'>
                  {formatTimestamp(ch.seconds)}
                </span>
                <span
                  className={cn(
                    'truncate text-[0.75rem] font-semibold font-sans',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {ch.title}
                </span>
                <Play
                  className={cn(
                    'size-2.5 shrink-0',
                    isActive ? 'fill-primary text-primary' : 'text-muted-foreground/40'
                  )}
                  fill={isActive ? 'currentColor' : 'none'}
                />
              </button>
            </li>
          )
        })}
      </ul>

      {/* Programme description stub */}
      <div className='border-t border-border px-3 py-2.5 flex-shrink-0'>
        <p className='line-clamp-4 text-[0.75rem] leading-relaxed text-muted-foreground font-sans'>
          録画番組の詳細説明がここに表示されます。番組データは Phase 6 以降で Mirakc から取得予定です。
        </p>
      </div>
    </aside>
  )
}

function FaultLog({ streamStatus, sessionId }: { streamStatus: string; sessionId?: string | undefined }) {
  const [open, setOpen] = useState(false)
  const clock = useClock()
  const now = format(clock, 'HH:mm:ss')

  const hasError = streamStatus === 'error'
  const statusVariant = hasError ? 'err' : streamStatus === 'ready' ? 'ok' : 'info'
  const statusLabel = hasError ? 'ERR' : streamStatus === 'ready' ? 'OK' : 'INIT'

  useEffect(() => {
    if (hasError) setOpen(true)
  }, [hasError])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className='border-t border-border/50'>
      <CollapsibleTrigger asChild>
        <button
          type='button'
          className={cn(
            'flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
            'font-mono text-[0.6875rem] font-bold text-muted-foreground'
          )}
          aria-expanded={open}
        >
          <span className={cn('transition-transform duration-150', open ? 'rotate-90' : 'rotate-0')} aria-hidden='true'>
            ›
          </span>
          <StatusChip variant={statusVariant} size='sm'>
            {statusLabel}
          </StatusChip>
          <span>transcoder log</span>
          <span className='ml-auto font-mono text-[0.6rem] text-muted-foreground/60'>最新: {now}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='max-h-[140px] overflow-y-auto bg-[hsl(222_26%_7%)] px-3 py-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm'>
          <LogLine ts={now} level='info'>
            [session] initializing…
          </LogLine>
          {sessionId && (
            <LogLine ts={now} level='info'>
              [api] POST /api/streams/recording → 201
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
          {hasError && (
            <LogLine ts={now} level='err'>
              [stream] start failed
            </LogLine>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function LogLine({ ts, level, children }: { ts: string; level: 'ok' | 'err' | 'info'; children: React.ReactNode }) {
  const levelClass = level === 'ok' ? 'text-green-500' : level === 'err' ? 'text-destructive' : 'text-primary'
  return (
    <div className='flex items-baseline gap-1.5 py-[1px] font-mono text-[0.625rem] leading-[1.6] text-muted-foreground'>
      <span className='shrink-0 opacity-55'>{ts}</span>
      <span className={levelClass}>{children}</span>
    </div>
  )
}

function ResumeToast({
  recordingId,
  videoRef
}: {
  recordingId: string
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const [dismissed, setDismissed] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current || dismissed) return
    const saved = localStorage.getItem(`${RESUME_KEY_PREFIX}${recordingId}`)
    if (!saved) return

    const seconds = Number(saved)
    if (!Number.isFinite(seconds) || seconds < 5) return

    shown.current = true
    toast(
      <div className='flex items-center gap-2.5 text-[0.8125rem]'>
        <Play className='size-3.5 shrink-0 fill-primary text-primary' />
        <span className='flex-1 font-sans'>前回の続きから再生します</span>
        <StatusChip variant='done' size='sm'>
          {formatTimestamp(Math.floor(seconds))}
        </StatusChip>
        <button
          type='button'
          className='font-mono text-[0.6875rem] font-bold text-muted-foreground hover:text-foreground transition-colors'
          onClick={() => {
            const v = videoRef.current
            if (v) v.currentTime = 0
            toast.dismiss()
          }}
        >
          最初から
        </button>
      </div>,
      {
        duration: 8000,
        onDismiss: () => setDismissed(true),
        onAutoClose: () => {
          const v = videoRef.current
          if (v) v.currentTime = seconds
        }
      }
    )
  }, [recordingId, videoRef, dismissed])

  return null
}

function RecordingPlayerPage() {
  const { id } = Route.useParams()
  const { data: rec, isPending, isError, error } = useRecording(id)
  const stream = useStream({ type: 'recording', recordingId: id })
  const videoRef = useRef<HTMLVideoElement>(null)
  const clock = useClock()
  const [videoDuration, setVideoDuration] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onDuration = () => setVideoDuration(v.duration || 0)
    v.addEventListener('durationchange', onDuration)
    return () => v.removeEventListener('durationchange', onDuration)
  }, [])

  const dateLabel = rec?.startedAt ? format(new Date(rec.startedAt), 'yyyy-MM-dd') : null

  const streamStatusVariant = stream.status === 'ready' ? 'ok' : stream.status === 'error' ? 'fatal' : 'info'
  const streamStatusLabel = stream.status === 'ready' ? 'OK' : stream.status === 'error' ? 'FATAL' : 'INIT'

  if (isPending) {
    return (
      <div className='flex flex-1 flex-col overflow-hidden'>
        <header className='flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3'>
          <Link to='/recordings' aria-label='録画一覧へ戻る'>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1 px-2 font-mono text-[0.6875rem] font-bold text-muted-foreground'
            >
              <ChevronLeft className='size-4' />
              録画一覧
            </Button>
          </Link>
          <div aria-hidden='true' className='h-[18px] w-px bg-border' />
          <Skeleton className='h-3.5 w-48' />
          <div className='flex-1' />
          <StatusChip variant='info' size='sm'>
            LOADING
          </StatusChip>
        </header>
        <div className='flex flex-1 items-center justify-center bg-[hsl(222_30%_5%)]'>
          <div role='status' className='h-9 w-9 rounded-full border-[2.5px] border-muted border-t-primary animate-spin'>
            <span className='sr-only'>録画データ読み込み中</span>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !rec) {
    const is404 = error instanceof Error && error.message.includes('404')
    return (
      <div className='flex flex-1 flex-col overflow-hidden'>
        <header className='flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3'>
          <Link to='/recordings' aria-label='録画一覧へ戻る'>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1 px-2 font-mono text-[0.6875rem] font-bold text-muted-foreground'
            >
              <ChevronLeft className='size-4' />
              録画一覧
            </Button>
          </Link>
        </header>
        <div className='flex flex-1 items-center justify-center p-6 bg-[hsl(222_30%_5%)]'>
          <div
            role='alert'
            className='max-w-[480px] rounded-md border border-border border-l-[3px] border-l-destructive bg-card p-4'
          >
            <div className='mb-2.5 flex items-center gap-2'>
              <StatusChip variant='fatal' size='sm'>
                {is404 ? '404' : 'ERR'}
              </StatusChip>
              <span className='text-[0.875rem] font-bold'>
                {is404 ? '録画が見つかりません' : '録画データを取得できませんでした'}
              </span>
            </div>
            <p className='mb-3 text-[0.75rem] text-muted-foreground'>
              {error instanceof Error ? error.message : '不明なエラー'}
            </p>
            <Link to='/recordings'>
              <Button variant='outline' size='sm'>
                録画一覧へ戻る
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* App bar */}
      <header className='flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3'>
        <Link to='/recordings' aria-label='録画一覧へ戻る'>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 px-2 font-mono text-[0.6875rem] font-bold text-muted-foreground hover:text-foreground'
          >
            <ChevronLeft className='size-4' />
            録画一覧
          </Button>
        </Link>

        <div aria-hidden='true' className='h-[18px] w-px bg-border' />

        {/* Breadcrumb */}
        <span className='font-mono text-[0.75rem] text-muted-foreground'>{rec.channelId}</span>
        <span aria-hidden='true' className='font-mono text-[0.75rem] text-border'>
          /
        </span>
        {dateLabel && <span className='font-mono text-[0.75rem] text-muted-foreground'>{dateLabel}</span>}

        <div className='flex-1' />

        {/* Status chips */}
        <StatusChip variant='done' size='sm'>
          VOD
        </StatusChip>
        <StatusChip variant={streamStatusVariant} size='sm'>
          {streamStatusLabel}
        </StatusChip>

        <span className='font-mono text-[0.75rem] font-semibold tabular-nums text-muted-foreground'>
          {format(clock, 'HH:mm:ss')}
        </span>
      </header>

      {/* Main area */}
      <div className='flex flex-1 overflow-hidden flex-col lg:flex-row'>
        {/* Video column */}
        <div className='flex flex-1 flex-col overflow-hidden min-w-0'>
          {/* Video well */}
          {stream.status === 'error' ? (
            <div className='flex flex-1 items-center justify-center p-6 bg-[hsl(222_30%_5%)]'>
              <div
                role='alert'
                className='max-w-[480px] rounded-md border border-border border-l-[3px] border-l-destructive bg-card p-4'
              >
                <div className='mb-2.5 flex items-center gap-2'>
                  <StatusChip variant='fatal' size='sm'>
                    FATAL
                  </StatusChip>
                  <span className='text-[0.875rem] font-bold'>ストリームを開始できませんでした</span>
                </div>
                <p className='mb-3 text-[0.75rem] text-muted-foreground'>{stream.error?.message ?? '不明なエラー'}</p>
                <Link to='/recordings/$id' params={{ id }}>
                  <Button size='sm'>再試行</Button>
                </Link>
              </div>
            </div>
          ) : stream.status === 'starting' || stream.status === 'idle' ? (
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
            <div
              className='flex flex-1 items-center justify-center bg-[hsl(222_30%_5%)]'
              role='application'
              aria-label='録画映像プレイヤー'
            >
              <HlsPlayer
                ref={videoRef}
                playlistUrl={stream.playlistUrl ?? ''}
                ariaLabel={`${rec.title} 録画映像`}
                className='max-h-full max-w-full'
                lowLatencyMode={false}
                onError={(err) => console.error('[HlsPlayer]', err)}
              />
              <ResumeToast recordingId={id} videoRef={videoRef} />
            </div>
          )}

          {/* Inline identity strip — between video well and seekbar */}
          <InlineIdentityStrip rec={rec} />

          {/* Controls */}
          <PlayerControls isLive={false} videoRef={videoRef} chapters={STUB_CHAPTERS} />

          {/* Fault log collapsible */}
          <FaultLog streamStatus={stream.status} sessionId={stream.sessionId} />
        </div>

        {/* Chapter side panel */}
        <ChapterPanel videoRef={videoRef} duration={videoDuration} />
      </div>
    </div>
  )
}
