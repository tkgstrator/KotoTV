import { useCallback, useEffect, useState } from 'react'

export type QualityChoice = 'auto' | 'high' | 'medium' | 'low'
export type CodecChoice = 'auto' | 'avc' | 'hevc' | 'vp9'

export interface PlaybackPrefs {
  quality: QualityChoice
  codec: CodecChoice
  autoplay: boolean
  defaultVolume: number
  lowLatency: boolean
}

const STORAGE_KEY = 'kototv-playback-prefs'

const DEFAULTS: PlaybackPrefs = {
  quality: 'auto',
  codec: 'auto',
  autoplay: true,
  defaultVolume: 1,
  lowLatency: true
}

function readStorage(): PlaybackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<PlaybackPrefs>
    return {
      quality: isQuality(parsed.quality) ? parsed.quality : DEFAULTS.quality,
      codec: isCodec(parsed.codec) ? parsed.codec : DEFAULTS.codec,
      autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : DEFAULTS.autoplay,
      defaultVolume: clampVolume(parsed.defaultVolume),
      lowLatency: typeof parsed.lowLatency === 'boolean' ? parsed.lowLatency : DEFAULTS.lowLatency
    }
  } catch {
    return DEFAULTS
  }
}

function isQuality(v: unknown): v is QualityChoice {
  return v === 'auto' || v === 'high' || v === 'medium' || v === 'low'
}

function isCodec(v: unknown): v is CodecChoice {
  return v === 'auto' || v === 'avc' || v === 'hevc' || v === 'vp9'
}

function clampVolume(v: unknown): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return DEFAULTS.defaultVolume
  return Math.max(0, Math.min(1, v))
}

export function usePlaybackPrefs() {
  const [prefs, setPrefs] = useState<PlaybackPrefs>(readStorage)

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setPrefs(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((patch: Partial<PlaybackPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // private browsing
      }
      return next
    })
  }, [])

  return { prefs, update }
}
