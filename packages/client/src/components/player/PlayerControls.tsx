import { Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Chapter, SeekbarChapters } from '@/components/player/SeekbarChapters'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const PLAYBACK_RATES = [0.5, 1.0, 1.25, 1.5, 2.0] as const
const QUALITY_OPTIONS = ['auto', '高', '中', '低'] as const

// Compact Shadcn-Select styling used by the three pickers in the control bar.
// Matches the old native-select dimensions (tiny font-mono pill) so the bar
// layout doesn't shift, while inheriting Shadcn's popover menu look.
const PICKER_TRIGGER_CLS =
  'h-7 px-2 py-0 min-w-0 gap-1 rounded border border-border bg-transparent font-mono text-[0.6875rem] text-foreground shadow-none [&_svg:not([class*=size-])]:size-3'
const PICKER_CONTENT_CLS = 'font-mono text-[0.75rem] min-w-[4.5rem]'
const PICKER_ITEM_CLS = 'font-mono text-[0.75rem] py-1 pr-6 pl-2'

const QUALITY_LABEL_TO_VALUE: Record<string, 'low' | 'mid' | 'high'> = {
  auto: 'mid',
  高: 'high',
  中: 'mid',
  低: 'low'
}

export type { Chapter }

export interface PlayerControlsProps {
  isLive: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  className?: string
  chapters?: Chapter[]
  codec?: 'avc' | 'hevc'
  onCodecChange?: (codec: 'avc' | 'hevc') => void
  quality?: 'low' | 'mid' | 'high'
  onQualityChange?: (quality: 'low' | 'mid' | 'high') => void
}

/**
 * Shared control bar for live view (isLive=true) and recording playback (isLive=false, Phase 5).
 *
 * When isLive=true:
 *   - Seek bar is read-only (role="progressbar"), tracking live edge via hls.js liveSyncPosition
 *   - Skip ±10s and playback rate controls are rendered but aria-disabled + pointer-events-none
 *
 * When isLive=false:
 *   - Seek bar is interactive (role="slider")
 *   - All controls are fully enabled
 */
export function PlayerControls({
  isLive,
  videoRef,
  className,
  chapters,
  codec,
  onCodecChange,
  quality: _quality,
  onQualityChange
}: PlayerControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [qualityLabel, setQualityLabel] = useState<string>('auto')
  const progressRafRef = useRef<number | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)

  const syncState = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setIsPlaying(!v.paused)
    setIsMuted(v.muted)
    setCurrentTime(v.currentTime)
    setDuration(v.duration || 0)
    if (v.duration) setProgress(v.currentTime / v.duration)
  }, [videoRef])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onVolumeChange = () => setIsMuted(v.muted)
    const onDurationChange = () => setDuration(v.duration || 0)

    const tickProgress = () => {
      if (!v.paused && v.duration) {
        setCurrentTime(v.currentTime)
        setProgress(v.currentTime / v.duration)
      }
      progressRafRef.current = requestAnimationFrame(tickProgress)
    }
    progressRafRef.current = requestAnimationFrame(tickProgress)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('volumechange', onVolumeChange)
    v.addEventListener('durationchange', onDurationChange)
    syncState()

    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('volumechange', onVolumeChange)
      v.removeEventListener('durationchange', onDurationChange)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (progressRafRef.current !== null) cancelAnimationFrame(progressRafRef.current)
    }
  }, [syncState, videoRef])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
  }

  const toggleFullscreen = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await v.requestFullscreen()
      }
    } catch {}
  }

  const skip = (seconds: number) => {
    const v = videoRef.current
    if (!v || isLive) return
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds))
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive) return
    const v = videoRef.current
    if (!v?.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    v.currentTime = Math.max(0, Math.min(v.duration, ratio * v.duration))
  }

  const handleSeekKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isLive) return
    const v = videoRef.current
    if (!v) return
    if (e.key === 'ArrowRight') skip(5)
    else if (e.key === 'ArrowLeft') skip(-5)
  }

  const handleRateChange = (value: string) => {
    const v = videoRef.current
    if (!v || isLive) return
    const rate = Number(value)
    v.playbackRate = rate
    setPlaybackRate(rate)
  }

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return '--:--'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const disabledLiveClass = isLive ? 'opacity-50 pointer-events-none' : ''

  return (
    <div className={cn('flex flex-col gap-1.5 px-2.5 py-2', className)}>
      {/* Seek / progress bar row */}
      <div className='flex items-center gap-2'>
        {isLive ? (
          <StatusChip variant='live' dot size='sm'>
            LIVE
          </StatusChip>
        ) : (
          <span className='font-mono text-[0.6rem] tabular-nums text-muted-foreground min-w-[3.5rem]'>
            {formatTime(currentTime)}
          </span>
        )}

        {isLive ? (
          <div
            role='progressbar'
            aria-label='番組経過'
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className='flex-1 h-1 rounded-full bg-muted overflow-hidden'
          >
            <div
              className='h-full bg-primary rounded-full transition-[width] duration-300'
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        ) : (
          <div
            ref={seekBarRef}
            role='slider'
            aria-label='シークバー'
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            className='relative flex-1 h-2 rounded-full bg-muted overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            onClick={handleSeek}
            onKeyDown={handleSeekKey}
          >
            <div className='h-full bg-primary rounded-full' style={{ width: `${Math.round(progress * 100)}%` }} />
            {chapters && chapters.length > 0 && duration > 0 && (
              <SeekbarChapters chapters={chapters} duration={duration} />
            )}
          </div>
        )}

        {!isLive && (
          <span className='font-mono text-[0.6rem] tabular-nums text-muted-foreground min-w-[3.5rem] text-right'>
            {formatTime(duration)}
          </span>
        )}
      </div>

      {/* Buttons row */}
      <div className='flex items-center gap-0.5'>
        {/* Play / Pause */}
        <Button
          variant='ghost'
          size='icon'
          aria-label={isPlaying ? '一時停止' : '再生'}
          onClick={togglePlay}
          className='h-10 w-10 shrink-0 [&_svg]:size-6!'
        >
          {isPlaying ? <Pause className='size-4' /> : <Play className='size-4' />}
        </Button>

        {/* Mute */}
        <Button
          variant='ghost'
          size='icon'
          aria-label={isMuted ? 'ミュート解除' : 'ミュート'}
          onClick={toggleMute}
          className='h-10 w-10 shrink-0 [&_svg]:size-6!'
        >
          {isMuted ? <VolumeX className='size-4' /> : <Volume2 className='size-4' />}
        </Button>

        <div aria-hidden='true' className='mx-1 h-5 w-px bg-border shrink-0' />

        {/* Skip back — live: disabled */}
        <Button
          variant='ghost'
          size='icon'
          aria-label='-10秒'
          aria-disabled={isLive ? 'true' : undefined}
          onClick={() => skip(-10)}
          className={cn('h-10 w-10 shrink-0 [&_svg]:size-6!', disabledLiveClass)}
          tabIndex={isLive ? -1 : 0}
        >
          <SkipBack className='size-4' />
        </Button>

        {/* Skip forward — live: disabled */}
        <Button
          variant='ghost'
          size='icon'
          aria-label='+10秒'
          aria-disabled={isLive ? 'true' : undefined}
          onClick={() => skip(10)}
          className={cn('h-10 w-10 shrink-0 [&_svg]:size-6!', disabledLiveClass)}
          tabIndex={isLive ? -1 : 0}
        >
          <SkipForward className='size-4' />
        </Button>

        <div className='flex-1' />

        {/* Playback rate — recording only (live streams cannot be time-scaled) */}
        {!isLive && (
          <Select value={String(playbackRate)} onValueChange={handleRateChange}>
            <SelectTrigger size='sm' aria-label='再生速度' className={PICKER_TRIGGER_CLS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={PICKER_CONTENT_CLS}>
              {PLAYBACK_RATES.map((r) => (
                <SelectItem key={r} value={String(r)} className={PICKER_ITEM_CLS}>
                  {r === 1.0 ? '1.0×' : `${r}×`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Quality picker — wires to onQualityChange when provided */}
        <Select
          value={qualityLabel}
          onValueChange={(label) => {
            setQualityLabel(label)
            onQualityChange?.(QUALITY_LABEL_TO_VALUE[label] ?? 'mid')
          }}
        >
          <SelectTrigger size='sm' aria-label='画質' className={PICKER_TRIGGER_CLS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={PICKER_CONTENT_CLS}>
            {QUALITY_OPTIONS.map((q) => (
              <SelectItem key={q} value={q} className={PICKER_ITEM_CLS}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Codec picker — only rendered when parent opts in via onCodecChange */}
        {onCodecChange && (
          <Select value={codec ?? 'avc'} onValueChange={(v) => onCodecChange(v as 'avc' | 'hevc')}>
            <SelectTrigger size='sm' aria-label='コーデック' className={PICKER_TRIGGER_CLS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={PICKER_CONTENT_CLS}>
              <SelectItem value='avc' className={PICKER_ITEM_CLS}>
                AVC
              </SelectItem>
              <SelectItem value='hevc' className={PICKER_ITEM_CLS}>
                HEVC
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        <div aria-hidden='true' className='mx-1 h-5 w-px bg-border shrink-0' />

        {/* Fullscreen */}
        <Button
          variant='ghost'
          size='icon'
          aria-label={isFullscreen ? 'フルスクリーン解除' : 'フルスクリーン'}
          onClick={toggleFullscreen}
          className='h-10 w-10 shrink-0 [&_svg]:size-6!'
        >
          {isFullscreen ? <Minimize className='size-4' /> : <Maximize className='size-4' />}
        </Button>
      </div>
    </div>
  )
}
