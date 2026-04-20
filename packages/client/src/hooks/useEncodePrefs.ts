import { useCallback, useEffect, useState } from 'react'
import type { EncodeCodec, EncodeQuality, EncodeTiming } from '@/types/RecordingRule'

export interface EncodePrefs {
  /** デフォルトで録画後エンコードを有効化するか */
  enabled: boolean
  codec: EncodeCodec
  quality: EncodeQuality
  timing: EncodeTiming
}

const STORAGE_KEY = 'kototv-encode-prefs'

const DEFAULTS: EncodePrefs = {
  enabled: false,
  codec: 'avc',
  quality: 'medium',
  timing: 'immediate'
}

function isCodec(v: unknown): v is EncodeCodec {
  return v === 'avc' || v === 'hevc' || v === 'vp9'
}

function isQuality(v: unknown): v is EncodeQuality {
  return v === 'high' || v === 'medium' || v === 'low'
}

function isTiming(v: unknown): v is EncodeTiming {
  return v === 'immediate' || v === 'idle'
}

function readStorage(): EncodePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<EncodePrefs>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      codec: isCodec(parsed.codec) ? parsed.codec : DEFAULTS.codec,
      quality: isQuality(parsed.quality) ? parsed.quality : DEFAULTS.quality,
      timing: isTiming(parsed.timing) ? parsed.timing : DEFAULTS.timing
    }
  } catch {
    return DEFAULTS
  }
}

export function useEncodePrefs() {
  const [prefs, setPrefs] = useState<EncodePrefs>(readStorage)

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setPrefs(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((patch: Partial<EncodePrefs>) => {
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
