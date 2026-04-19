import Hls from 'hls.js'
import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface HlsPlayerProps {
  playlistUrl: string
  onError?: (err: Error) => void
  onReady?: () => void
  className?: string
  autoPlay?: boolean
  muted?: boolean
  ariaLabel?: string
  lowLatencyMode?: boolean
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
  (
    { playlistUrl, onError, onReady, className, autoPlay = true, muted = true, ariaLabel, lowLatencyMode = false },
    ref
  ) => {
    const internalRef = useRef<HTMLVideoElement>(null)
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) ?? internalRef

    // Stash callbacks in refs so they don't retrigger the hls.js effect when
    // a parent passes inline arrow functions. Previously the effect re-ran
    // on every parent re-render (e.g. the 1 Hz useClock tick), destroying
    // and recreating the Hls instance — each rebuild fires several playlist
    // requests, which produced the "thousands of GET /playlist.m3u8" storm.
    const onErrorRef = useRef(onError)
    const onReadyRef = useRef(onReady)
    onErrorRef.current = onError
    onReadyRef.current = onReady

    useEffect(() => {
      const video = videoRef.current
      if (!video) return

      let retryCount = 0

      // Prefer hls.js wherever it is supported (all Chromium / Firefox). Only
      // fall back to the native <video src> path for browsers that cannot
      // run hls.js (iOS Safari). Testing canPlayType() first was wrong —
      // Chromium returns "maybe" for application/vnd.apple.mpegurl even
      // though it does NOT really play HLS, which sent the <video> into a
      // tight playlist-polling retry loop (360 req/s).
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playlistUrl
          if (autoPlay) video.play().catch(() => {})
          onReadyRef.current?.()
          return
        }
        onErrorRef.current?.(new Error('HLS not supported in this browser'))
        return
      }

      // Use hls.js defaults — the official docs show `new Hls()` with no
      // options as the recommended entry point. We keep the lowLatencyMode
      // prop as an escape hatch for callers that know their server emits
      // LL-HLS, but default to undefined so hls.js picks its own defaults.
      const hls = new Hls(lowLatencyMode ? { lowLatencyMode: true } : {})

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
        if (autoPlay) video.play().catch(() => {})
      })

      hls.loadSource(playlistUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
      // videoRef is a RefObject (stable); onError/onReady are captured via refs above.
      // Only playlistUrl, autoPlay, and lowLatencyMode should re-init the player.
    }, [playlistUrl, autoPlay, videoRef, lowLatencyMode])

    return (
      <video
        ref={videoRef}
        className={cn('h-full w-full object-contain', className)}
        controls={false}
        playsInline
        muted={muted}
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
