import { useEffect, useState } from 'react'

export interface VideoDiagnostics {
  /** Native video resolution reported by the decoder. 0 before MANIFEST_PARSED. */
  videoWidth: number
  videoHeight: number
  /** Seconds of media buffered ahead of the playhead. */
  bufferedAhead: number
  /** Current playhead in seconds. */
  currentTime: number
  /** Running total of decoded frames per the MediaElement getVideoPlaybackQuality API. */
  decodedFrames: number
  droppedFrames: number
  /** True once the video element has loaded metadata (readyState >= 1). */
  hasMetadata: boolean
}

const EMPTY: VideoDiagnostics = {
  videoWidth: 0,
  videoHeight: 0,
  bufferedAhead: 0,
  currentTime: 0,
  decodedFrames: 0,
  droppedFrames: 0,
  hasMetadata: false
}

/**
 * Polls the given <video> element once per second to pull the live decode
 * metrics the diagnostic sidebar surfaces. Accepts the element directly
 * (callback-ref pattern) so the polling re-arms when the video mounts —
 * a RefObject wouldn't trigger the effect because refs don't re-render.
 */
export function useVideoDiagnostics(videoEl: HTMLVideoElement | null): VideoDiagnostics {
  const [diag, setDiag] = useState<VideoDiagnostics>(EMPTY)

  useEffect(() => {
    const v = videoEl
    if (!v) return

    const tick = () => {
      const buffered = v.buffered
      let ahead = 0
      for (let i = 0; i < buffered.length; i++) {
        const end = buffered.end(i)
        const start = buffered.start(i)
        if (start <= v.currentTime && end >= v.currentTime) {
          ahead = Math.max(0, end - v.currentTime)
          break
        }
      }

      const q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null

      setDiag({
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        bufferedAhead: ahead,
        currentTime: v.currentTime,
        decodedFrames: q?.totalVideoFrames ?? 0,
        droppedFrames: q?.droppedVideoFrames ?? 0,
        hasMetadata: v.readyState >= 1
      })
    }

    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [videoEl])

  return diag
}
