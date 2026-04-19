import Hls from 'hls.js'
import { forwardRef, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface HlsPlayerProps {
  playlistUrl: string
  onError?: (err: Error) => void
  onReady?: () => void
  className?: string
  autoPlay?: boolean
  ariaLabel?: string
  lowLatencyMode?: boolean
}

const MAX_RETRIES = 3

/**
 * Single HLS player component shared by live view and (Phase 5) recording
 * playback. Keeps hls.js initialization and cleanup self-contained so that
 * parent components only deal with stream lifecycle (useStream / useRecordingStream).
 *
 * forwardRef accepts either a RefObject or a callback ref — we always drive
 * hls.js off an internal ref and fan the <video> element out to the
 * forwarded ref on mount/unmount via mergeRef.
 */
export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(
  // Default lowLatencyMode=false — our dummy output is standard HLS (no
  // #EXT-X-PART partial segments). lowLatencyMode=true makes hls.js poll the
  // playlist harder looking for partial updates that never exist, which
  // shows up in DevTools as a firehose of requests.
  ({ playlistUrl, onError, onReady, className, autoPlay = true, ariaLabel, lowLatencyMode = false }, ref) => {
    const internalRef = useRef<HTMLVideoElement>(null)

    // Merge internal ref + forwarded ref. Callback refs get called with the
    // element; RefObjects get their `.current` assigned. Supporting both
    // means parents can use useRef or useState (callback ref) equivalently.
    const mergedRef = useCallback(
      (node: HTMLVideoElement | null) => {
        internalRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as { current: HTMLVideoElement | null }).current = node
      },
      [ref]
    )

    // Latch callbacks via refs so the effect doesn't reattach the media source
    // every render when parents pass inline functions. Without this, hls.destroy()
    // fires before MANIFEST_PARSED → the player never starts playback.
    const onErrorRef = useRef(onError)
    const onReadyRef = useRef(onReady)
    onErrorRef.current = onError
    onReadyRef.current = onReady

    useEffect(() => {
      const video = internalRef.current
      if (!video) return

      let retryCount = 0

      // iOS Safari: native HLS — skip hls.js entirely.
      // Mute before autoplay — modern browsers block playback with audio
      // unless the user has interacted with the document first.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl
        if (autoPlay) {
          video.muted = true
          video.play().catch(() => {})
        }
        onReadyRef.current?.()
        return
      }

      if (!Hls.isSupported()) {
        onErrorRef.current?.(new Error('HLS not supported in this browser'))
        return
      }

      const hls = new Hls({
        lowLatencyMode,
        liveSyncDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.05,
        enableWorker: true
      })

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return

        if (retryCount >= MAX_RETRIES) {
          onErrorRef.current?.(new Error(`hls fatal after ${MAX_RETRIES} retries: ${data.details}`))
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
            onErrorRef.current?.(new Error(`hls fatal: ${data.details}`))
            hls.destroy()
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onReadyRef.current?.()
        if (autoPlay) {
          video.muted = true
          video.play().catch(() => {})
        }
      })

      hls.loadSource(playlistUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
    }, [playlistUrl, autoPlay, lowLatencyMode])

    return (
      <video
        ref={mergedRef}
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
