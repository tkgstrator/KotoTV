---
name: hls-player
description: hls.js integration patterns for the `<HlsPlayer>` React component and the `useLiveStream` / `useRecordingStream` hooks. Load when editing `packages/client/src/components/player/*` or the streaming hooks.
---

# `<HlsPlayer>` — hls.js wrapper

One React component wraps hls.js. Every live view, every recording playback, shares this component. Keep it dumb (props in, events out) — the streaming session lifecycle (acquire/release) lives in hooks, not here.

## Retrieval sources

| Source | URL |
|--------|-----|
| hls.js docs | https://github.com/video-dev/hls.js/blob/master/docs/API.md |
| hls.js events | https://github.com/video-dev/hls.js/blob/master/src/events.ts |

## Component skeleton

```tsx
// packages/client/src/components/player/HlsPlayer.tsx
import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

export type HlsPlayerProps = {
  src: string
  autoPlay?: boolean
  lowLatency?: boolean                     // live = true, recording = false
  onError?: (err: Error) => void
  onReady?: () => void
  className?: string
}

export function HlsPlayer({ src, autoPlay = true, lowLatency = true, onError, onReady, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Safari / iOS: native HLS support; skip hls.js
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      if (autoPlay) video.play().catch(() => {})
      onReady?.()
      return
    }

    if (!Hls.isSupported()) {
      onError?.(new Error('HLS not supported'))
      return
    }

    const hls = new Hls({
      lowLatencyMode: lowLatency,
      liveSyncDurationCount: 3,
      maxLiveSyncPlaybackRate: 1.05,
      enableWorker: true,
    })

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
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
      }
    })

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      onReady?.()
      if (autoPlay) video.play().catch(() => {})
    })

    hls.loadSource(src)
    hls.attachMedia(video)

    return () => { hls.destroy() }
  }, [src, autoPlay, lowLatency, onError, onReady])

  return (
    <video
      ref={videoRef}
      className={className}
      controls
      playsInline
      tabIndex={0}                          // focusable for remote-control UX
    />
  )
}
```

## Session lifecycle (`useLiveStream`)

The hook owns acquire/release. The component mounts with an `src`; when it unmounts or the channel changes, the hook calls `DELETE /api/streams/:sessionId`.

```ts
// packages/client/src/hooks/useLiveStream.ts
import { useEffect, useState } from 'react'
import { api } from '@/api/client'

export function useLiveStream(channelId: string) {
  const [state, setState] = useState<{ sessionId: string, playlistUrl: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    let sessionId: string | null = null

    ;(async () => {
      const res = await api.api.streams.live[':channelId'].$post({ param: { channelId } })
      if (!res.ok) return
      const data = await res.json()
      sessionId = data.sessionId
      if (!cancelled) setState(data)
    })()

    return () => {
      cancelled = true
      if (sessionId) {
        api.api.streams[':sessionId'].$delete({ param: { sessionId } }).catch(() => {})
      }
    }
  }, [channelId])

  return state
}
```

## Live vs. recording

- **Live**: `lowLatency: true`, `liveSyncDurationCount: 3`. No seek bar manipulation — hls.js keeps you near the live edge.
- **Recording (Phase 5)**: `lowLatency: false`. Enable `seekable` range UI. Same `HlsPlayer` — just flip the prop.

## Controls overlay

Keep native `<video controls>` until a feature requires custom controls. When going custom (Phase 5 seek-to-chapter, quality picker), compose:

- `Slider` (Shadcn) for scrub bar
- `Button` / `DropdownMenu` (Shadcn) for play-pause / quality
- Keep the `<video>` element un-styled underneath; style the overlay.

Every control must be reachable via keyboard (Tab / Enter / Space / arrow). Future tvOS/FireTV port needs this.

## Buffer / retry policy

- On network error, hls.js already retries (`startLoad`). Don't stack our own retry.
- On manifest-404 (session expired on the server), the hook should re-acquire — wire `onError` to trigger a state reset.
- Keep a health timer (30s no progress → re-acquire). Network flakiness is common.

## Accessibility

- `<video>` needs `aria-label` describing the stream (e.g. channel name).
- Subtitle / audio-track selection (later): expose via hls.js `subtitleTracks` / `audioTracks` APIs inside the player. Use Shadcn `DropdownMenu`.

## Pitfalls

- Instantiating `new Hls()` without destroying on unmount → leaked XHRs, memory growth. Always `hls.destroy()` in cleanup.
- Relying on Safari's native HLS is correct for iOS, but Safari's live-edge policy differs; test separately.
- `video.play()` throws `NotAllowedError` without user gesture. Swallow silently and show a play overlay if needed.
- `lowLatencyMode: true` on non-LL-HLS streams is harmless; keep it on for live paths.