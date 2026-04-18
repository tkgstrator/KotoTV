import Hls from 'hls.js'
import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface HlsPlayerProps {
  playlistUrl: string
  onError?: (err: Error) => void
  onReady?: () => void
  className?: string
  autoPlay?: boolean
  ariaLabel?: string
}

const MAX_RETRIES = 3

/**
 * Single HLS player component shared by live view and (Phase 5) recording
 * playback. Keeps hls.js initialization and cleanup self-contained so that
 * parent components only deal with stream lifecycle (useStream / useRecordingStream).
 *
 * forwardRef exposes the underlying <video> element so PlayerControls can
 * call play() / pause() and read/write muted without prop-drilling.
 */
export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(
  ({ playlistUrl, onError, onReady, className, autoPlay = true, ariaLabel }, ref) => {
    const internalRef = useRef<HTMLVideoElement>(null)
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) ?? internalRef

    useEffect(() => {
      const video = videoRef.current
      if (!video) return

      let retryCount = 0

      // iOS Safari: native HLS — skip hls.js entirely
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl
        if (autoPlay) video.play().catch(() => {})
        onReady?.()
        return
      }

      if (!Hls.isSupported()) {
        onError?.(new Error('HLS not supported in this browser'))
        return
      }

      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.05,
        enableWorker: true
      })

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return

        if (retryCount >= MAX_RETRIES) {
          onError?.(new Error(`hls fatal after ${MAX_RETRIES} retries: ${data.details}`))
          hls.destroy()
          return
        }

        retryCount++

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError()
            break
          default:
            onError?.(new Error(`hls fatal: ${data.details}`))
            hls.destroy()
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onReady?.()
        if (autoPlay) video.play().catch(() => {})
      })

      hls.loadSource(playlistUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
    }, [playlistUrl, autoPlay, onError, onReady, videoRef])

    return (
      <video
        ref={videoRef}
        className={cn('h-full w-full object-contain', className)}
        controls={false}
        playsInline
        tabIndex={0}
        aria-label={ariaLabel ?? 'ライブ映像'}
      >
        {/* Captions track placeholder — actual subtitles wired in Phase 5 */}
        <track kind='captions' />
      </video>
    )
  }
)
HlsPlayer.displayName = 'HlsPlayer'
