import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'

export type StreamStatus = 'idle' | 'starting' | 'ready' | 'error'

export interface StreamState {
  status: StreamStatus
  playlistUrl?: string
  sessionId?: string
  error?: Error
}

/**
 * Manages the HLS stream session lifecycle for a given channel.
 *
 * StrictMode-safe: sessionIdRef guards against the double-invocation of the
 * effect in development. In production there is only one mount, so it is a no-op.
 *
 * The DELETE call on cleanup uses raw fetch rather than the RPC client because
 * the cleanup runs when the component unmounts — at that point, React has already
 * torn down the component tree and a mutation promise would never settle cleanly.
 */
export function useStream(channelId: string): StreamState {
  const [state, setState] = useState<StreamState>({ status: 'idle' })
  const sessionIdRef = useRef<string | null>(null)

  const start = useCallback(async () => {
    if (sessionIdRef.current) return

    setState({ status: 'starting' })

    try {
      const res = await api.api.streams.live[':channelId'].$post({
        param: { channelId }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      sessionIdRef.current = data.sessionId
      setState({ status: 'ready', playlistUrl: data.playlistUrl, sessionId: data.sessionId })
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
    }
  }, [channelId])

  useEffect(() => {
    start()

    return () => {
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      if (sid) {
        fetch(`/api/streams/${sid}`, { method: 'DELETE' }).catch(() => {})
      }
    }
  }, [start])

  return state
}
