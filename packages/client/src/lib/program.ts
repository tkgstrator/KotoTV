import type { ProgramSummary } from '@kototv/server/src/schemas/Channel.dto'
import { format } from 'date-fns'

/**
 * Maps a genre label string (ARIB lv1 category prefix) to an oklch color token.
 * These are tuned for the tech theme's dark/light dual palette.
 */
const GENRE_COLOR_MAP: Record<string, string> = {
  ニュース: 'oklch(0.6 0.15 247)',
  報道: 'oklch(0.6 0.15 247)',
  スポーツ: 'oklch(0.6 0.18 145)',
  ドラマ: 'oklch(0.6 0.18 295)',
  バラエティ: 'oklch(0.65 0.18 65)',
  音楽: 'oklch(0.65 0.18 320)',
  映画: 'oklch(0.6 0.18 30)',
  アニメ: 'oklch(0.65 0.18 340)',
  特撮: 'oklch(0.65 0.18 340)',
  ドキュメンタリー: 'oklch(0.6 0.16 190)',
  教養: 'oklch(0.6 0.16 190)',
  趣味: 'oklch(0.6 0.16 120)',
  情報: 'oklch(0.6 0.15 60)',
  ワイドショー: 'oklch(0.6 0.15 60)',
  劇場: 'oklch(0.6 0.16 20)',
  公演: 'oklch(0.6 0.16 20)',
  福祉: 'oklch(0.6 0.14 160)'
}

const GENRE_COLOR_FALLBACK = 'oklch(0.55 0.04 247)'

export function genreToColor(genre: string): string {
  for (const [key, color] of Object.entries(GENRE_COLOR_MAP)) {
    if (genre.includes(key)) return color
  }
  return GENRE_COLOR_FALLBACK
}

export function formatRemainingMinutes(endAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(endAt).getTime() - now) / 60_000))
}

export function formatTimeRange(startAt: string, endAt: string): string {
  const s = new Date(startAt)
  const e = new Date(endAt)
  return `${format(s, 'HH:mm')} – ${format(e, 'HH:mm')}`
}

export function getProgress(startAt: string, endAt: string, now = Date.now()): number {
  const s = new Date(startAt).getTime()
  const e = new Date(endAt).getTime()
  if (e <= s) return 0
  return Math.min(1, Math.max(0, (now - s) / (e - s)))
}

/** Returns "まもなく終了" when <5min remain, otherwise null. */
export function getRemainingLabel(endAt: string, now = Date.now()): string | null {
  const remaining = new Date(endAt).getTime() - now
  return remaining > 0 && remaining < 5 * 60 * 1000 ? 'まもなく終了' : null
}

export function pickNextLabel(next: ProgramSummary | null): string | null {
  if (!next) return null
  const time = format(new Date(next.startAt), 'HH:mm')
  return `次: ${next.title} ${time}`
}
