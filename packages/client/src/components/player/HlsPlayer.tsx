import type { HlsConfig } from 'hls.js'
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
  /** VOD playback skips live-tuned buffer settings. */
  isVod?: boolean
}

const MAX_RETRIES = 3

// Tuned for our 2 s segment / 6-segment playlist FFmpeg output.
// Without these, hls.js starts from ct=0 with only ~4 s of buffer;
// playback consumes it faster than FFmpeg produces new segments,
// causing a visible stutter around the 4 s mark.
const LIVE_CONFIG: Partial<HlsConfig> = {
  liveSyncDuration: 6,
  liveMaxLatencyDuration: 12,
  maxBufferLength: 12,
  backBufferLength: 10
}

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
    {
      playlistUrl,
      onError,
      onReady,
      className,
      autoPlay = true,
      muted = false,
      ariaLabel,
      lowLatencyMode = false,
      isVod = false
    },
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
          if (autoPlay) {
            // Try with sound first; if the browser blocks unmuted autoplay
            // (no prior user gesture / low MEI), fall back to muted playback.
            video.play().catch(() => {
              video.muted = true
              video.play().catch(() => {})
            })
          }
          onReadyRef.current?.()
          return
        }
        onErrorRef.current?.(new Error('HLS not supported in this browser'))
        return
      }

      const hlsConfig: Partial<HlsConfig> = {
        ...(isVod ? {} : LIVE_CONFIG),
        ...(lowLatencyMode ? { lowLatencyMode: true } : {})
      }
      const hls = new Hls(hlsConfig)

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
          // Try with sound first; if the browser blocks unmuted autoplay
          // (no prior user gesture / low MEI), fall back to muted playback.
          video.play().catch(() => {
            video.muted = true
            video.play().catch(() => {})
          })
        }
      })

      hls.loadSource(playlistUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
      // videoRef is a RefObject (stable); onError/onReady are captured via refs above.
      // Only playlistUrl, autoPlay, and lowLatencyMode should re-init the player.
    }, [playlistUrl, autoPlay, videoRef, lowLatencyMode, isVod])

    return (
      <video
        ref={videoRef}
        // Intrinsic sizing: the element itself takes the video's aspect
        // ratio within whatever max-h/max-w the caller passes. Explicit
        // h-full/w-full would force the <video> box to fill the parent and
        // letterbox the picture inside, eating vertical space.
        className={cn('object-contain', className)}
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
