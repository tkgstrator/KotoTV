import { useCallback, useEffect, useState } from 'react'
import type { CodecChoice } from './usePlaybackPrefs'

export interface RecordingPrefs {
  /** Default output codec used when converting .ts → final file. */
  defaultCodec: CodecChoice
  /** Default priority value prefilled when creating a new rule (1-100, 50 is neutral). */
  defaultPriority: number
  /** Default value for 再放送スキップ (avoidDuplicates) in new rules. */
  avoidDuplicatesDefault: boolean
  /** Keep the intermediate .ts after conversion completes. */
  keepTsAfterConvert: boolean
  /** Disk usage percentage at which settings flips to WARN status. */
  diskWarnPct: number
}

const STORAGE_KEY = 'kototv-recording-prefs'

const DEFAULTS: RecordingPrefs = {
  defaultCodec: 'auto',
  defaultPriority: 50,
  avoidDuplicatesDefault: true,
  keepTsAfterConvert: false,
  diskWarnPct: 85
}

function isCodec(v: unknown): v is CodecChoice {
  return v === 'auto' || v === 'avc' || v === 'hevc' || v === 'vp9'
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback
  return Math.max(min, Math.min(max, Math.round(v)))
}

function readStorage(): RecordingPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<RecordingPrefs>
    return {
      defaultCodec: isCodec(parsed.defaultCodec) ? parsed.defaultCodec : DEFAULTS.defaultCodec,
      defaultPriority: clampInt(parsed.defaultPriority, 1, 100, DEFAULTS.defaultPriority),
      avoidDuplicatesDefault:
        typeof parsed.avoidDuplicatesDefault === 'boolean'
          ? parsed.avoidDuplicatesDefault
          : DEFAULTS.avoidDuplicatesDefault,
      keepTsAfterConvert:
        typeof parsed.keepTsAfterConvert === 'boolean' ? parsed.keepTsAfterConvert : DEFAULTS.keepTsAfterConvert,
      diskWarnPct: clampInt(parsed.diskWarnPct, 50, 99, DEFAULTS.diskWarnPct)
    }
  } catch {
    return DEFAULTS
  }
}

export function useRecordingPrefs() {
  const [prefs, setPrefs] = useState<RecordingPrefs>(readStorage)

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setPrefs(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((patch: Partial<RecordingPrefs>) => {
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
