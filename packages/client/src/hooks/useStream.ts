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

function resolveLiveCodec(pref: 'auto' | 'avc' | 'hevc' | 'vp9'): LiveCodecChoice {
  // `auto` → pick a sensible default the current backend always supports.
  // In the future this should inspect navigator / MediaSource capabilities,
  // but picking AVC is a safe starting point.
  return pref === 'auto' ? 'avc' : pref
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
          fetch(`/api/streams/${data.sessionId}`, { method: 'DELETE' }).catch(() => {})
          return
        }
        sessionIdRef.current = data.sessionId
        setState({ status: 'ready', playlistUrl: data.playlistUrl, sessionId: data.sessionId })
      } catch (err) {
        if (cancelled) return
        setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      }
    })()

    return () => {
      cancelled = true
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      if (sid) {
        fetch(`/api/streams/${sid}`, { method: 'DELETE' }).catch(() => {})
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: sourceKey encodes source identity
  }, [sourceKey])

  return state
}
