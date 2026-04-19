import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { usePlaybackPrefs } from './usePlaybackPrefs'

export type StreamStatus = 'idle' | 'starting' | 'ready' | 'error'

export interface StreamState {
  status: StreamStatus
  playlistUrl?: string
  sessionId?: string
  error?: Error
}

export type LiveCodecChoice = 'avc' | 'hevc' | 'vp9'
export type LiveQualityChoice = 'auto' | 'high' | 'medium' | 'low'

export type StreamSource = { type: 'live'; channelId: string } | { type: 'recording'; recordingId: string }

/**
 * MSE codec strings to probe. Keep these in sync with buildDummyLiveArgs on
 * the server — we want MediaSource.isTypeSupported to agree with what ffmpeg
 * emits, so "codec negotiated" actually plays.
 */
const CODEC_PROBE: Record<LiveCodecChoice, string[]> = {
  avc: ['video/mp4; codecs="avc1.4D401F,mp4a.40.2"', 'video/mp2t; codecs="avc1.4D401F,mp4a.40.2"'],
  hevc: ['video/mp4; codecs="hvc1.1.6.L90.B0,mp4a.40.2"', 'video/mp2t; codecs="hvc1.1.6.L90.B0,mp4a.40.2"'],
  vp9: ['video/mp4; codecs="vp09.00.10.08,opus"', 'video/webm; codecs="vp9,opus"']
}

function codecSupported(codec: LiveCodecChoice): boolean {
  if (typeof window === 'undefined' || typeof MediaSource === 'undefined') return true
  const probes = CODEC_PROBE[codec]
  return probes.some((p) => MediaSource.isTypeSupported(p))
}

/**
 * Fire a DELETE for the session. During page unload browsers cancel
 * regular fetch() calls, so pass `keepalive: true` which tells the
 * browser to let this request finish even after the page is gone.
 * (navigator.sendBeacon only supports POST — not DELETE — so it's not
 * applicable here.)
 */
function releaseSession(sessionId: string): void {
  fetch(`/api/streams/${sessionId}`, { method: 'DELETE', keepalive: true }).catch(() => {})
}

function resolveLiveCodec(pref: 'auto' | 'avc' | 'hevc' | 'vp9'): LiveCodecChoice {
  // AVC is the only codec the dummy ffmpeg pipeline has been proven to
  // decode reliably across Chrome / Safari / Firefox. HEVC requires HW
  // decode on most browsers (Chrome on Linux, Firefox) and VP9 in fMP4 HLS
  // has patchy support. Until we wire per-codec canary decoding, pin the
  // live path to AVC regardless of pref. Pref still feeds the server query
  // so switching to HEVC/VP9 is a one-line change when we're ready.
  if (codecSupported('avc')) return 'avc'
  if (pref !== 'auto' && codecSupported(pref)) return pref
  if (codecSupported('vp9')) return 'vp9'
  if (codecSupported('hevc')) return 'hevc'
  return 'avc'
}

/**
 * Manages the HLS stream session lifecycle for a given source (live channel or recording).
 *
 * StrictMode-safe: sessionIdRef guards against the double-invocation of the
 * effect in development. In production there is only one mount, so it is a no-op.
 *
 * The DELETE call on cleanup uses raw fetch rather than the RPC client because
 * the cleanup runs when the component unmounts — at that point, React has already
 * torn down the component tree and a mutation promise would never settle cleanly.
 */
export function useStream(source: StreamSource): StreamState {
  const [state, setState] = useState<StreamState>({ status: 'idle' })
  const sessionIdRef = useRef<string | null>(null)
  const { prefs } = usePlaybackPrefs()
  const liveCodec = resolveLiveCodec(prefs.codec)
  const liveQuality: LiveQualityChoice = prefs.quality

  // Depend on primitive identity, not object identity — callers inline
  // `{ type: 'live', channelId }` so `source` changes reference every render.
  // Include codec + quality so a pref change restarts the live session with
  // the new settings.
  const sourceKey =
    source.type === 'live' ? `live:${source.channelId}:${liveQuality}:${liveCodec}` : `recording:${source.recordingId}`

  useEffect(() => {
    let cancelled = false
    setState({ status: 'starting' })

    ;(async () => {
      try {
        let res: Response
        if (source.type === 'live') {
          res = await api.api.streams.live[':channelId'].$post({
            param: { channelId: source.channelId },
            query: { quality: liveQuality, codec: liveCodec }
          })
        } else {
          res = await api.api.streams.recording[':recordingId'].$post({ param: { recordingId: source.recordingId } })
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) {
          releaseSession(data.sessionId)
          return
        }
        sessionIdRef.current = data.sessionId
        setState({ status: 'ready', playlistUrl: data.playlistUrl, sessionId: data.sessionId })
      } catch (err) {
        if (cancelled) return
        setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      }
    })()

    // pagehide / beforeunload fire when the browser is tearing the page
    // down (reload, close, navigation off-site). In that moment fetch()
    // may be cancelled mid-flight — sendBeacon is designed for this path
    // and guarantees delivery.
    const onPageHide = () => {
      const sid = sessionIdRef.current
      if (sid) releaseSession(sid)
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      cancelled = true
      window.removeEventListener('pagehide', onPageHide)
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      if (sid) releaseSession(sid)
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: sourceKey encodes source identity
  }, [sourceKey])

  return state
}
