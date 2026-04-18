export interface TimePreset {
  label: string
  start: number
  end: number
}

export const TIME_PRESETS: TimePreset[] = [
  { label: '早朝', start: 5 * 60, end: 9 * 60 },
  { label: '昼', start: 11 * 60, end: 14 * 60 },
  { label: '夕方', start: 17 * 60, end: 19 * 60 },
  { label: '夜', start: 19 * 60, end: 23 * 60 },
  { label: '深夜', start: 23 * 60, end: 4 * 60 },
  { label: '終日', start: 0, end: 24 * 60 }
]

export const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const

// ARIB STD-B10 content genres (simplified Japanese labels)
export const ARIB_GENRES = [
  { value: '0', label: 'ニュース/報道' },
  { value: '1', label: 'スポーツ' },
  { value: '2', label: '情報/ワイドショー' },
  { value: '3', label: 'ドラマ' },
  { value: '4', label: '音楽' },
  { value: '5', label: 'バラエティ' },
  { value: '6', label: '映画' },
  { value: '7', label: 'アニメ/特撮' },
  { value: '8', label: 'ドキュメンタリー/教養' },
  { value: '9', label: '劇場/公演' },
  { value: '10', label: '趣味/教育' },
  { value: '11', label: '福祉' },
  { value: '15', label: 'その他' }
] as const

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function HHMMToMinutes(hhmm: string): number | null {
  const parts = hhmm.split(':').map(Number)
  const h = parts[0]
  const m = parts[1]
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function matchingPreset(start: number | null | undefined, end: number | null | undefined): TimePreset | null {
  if (start == null || end == null) return null
  return TIME_PRESETS.find((p) => p.start === start && p.end === end) ?? null
}
