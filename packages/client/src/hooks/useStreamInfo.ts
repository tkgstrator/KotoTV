import type { StreamInfo } from '@kototv/server/src/schemas/Stream.dto'
import { useEffect, useState } from 'react'

export type { StreamInfo }

/**
 * Subscribes to the SSE endpoint for a stream session and returns the latest
 * StreamInfo snapshot. On error the last known value is retained so the sidebar
 * does not blank out on a transient reconnect.
 */
export function useStreamInfo(sessionId: string | undefined): StreamInfo | null {
  const [info, setInfo] = useState<StreamInfo | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`/api/streams/${sessionId}/info`)

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as StreamInfo
        setInfo(parsed)
      } catch {}
    }

    // Keep last known value on error — SSE will auto-reconnect
    es.onerror = () => {}

    return () => {
      es.close()
    }
  }, [sessionId])

  return info
}
