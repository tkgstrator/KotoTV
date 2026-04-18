const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * Returns the day of week (0=Sun, 6=Sat) for a given Date interpreted in JST.
 * Avoids relying on the process TZ env variable.
 */
export function getJstDayOfWeek(date: Date): number {
  const jstMs = date.getTime() + JST_OFFSET_MS
  return new Date(jstMs).getUTCDay()
}

/**
 * Returns the minutes since midnight (0–1439) for a given Date interpreted in JST.
 * Avoids relying on the process TZ env variable.
 */
export function getJstMinutes(date: Date): number {
  const jstMs = date.getTime() + JST_OFFSET_MS
  const jst = new Date(jstMs)
  return jst.getUTCHours() * 60 + jst.getUTCMinutes()
}
