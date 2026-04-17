import type { ProgramSummary } from '@telemax/server/src/schemas/Channel.dto'
import { format } from 'date-fns'

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
