/**
 * Markers that indicate a rerun/repeat broadcast.
 * Listed explicitly to avoid over-eager stripping.
 */
const RERUN_PATTERN =
  /[\s\u3000]*(?:[[(【][\s\u3000]*)?(?:リピート|再放送|再|リピ|repeat)[\s\u3000]*(?:[\])】])?[\s\u3000]*/gi

/**
 * Normalize a program title for duplicate-detection purposes.
 *
 * Applied in order:
 * 1. Fullwidth → halfwidth: digits, ASCII letters, common symbols
 * 2. Rerun marker removal (prefix, suffix, or inline)
 * 3. Whitespace normalization (fullwidth space → space, collapse runs, trim)
 * 4. Lowercase (affects ASCII letters only; Japanese is unchanged)
 */
export function normalizeTitleForDedup(title: string): string {
  let s = title

  // 1. Fullwidth digits → halfwidth (０-９ → 0-9)
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

  // 1. Fullwidth ASCII letters → halfwidth (Ａ-Ｚ, ａ-ｚ)
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

  // 1. Fullwidth symbols → halfwidth
  s = s
    .replace(/＃/g, '#')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/【/g, '[')
    .replace(/】/g, ']')

  // 2. Remove rerun markers wherever they appear
  // Reset lastIndex because the 'g' flag retains state across calls
  RERUN_PATTERN.lastIndex = 0
  s = s.replace(RERUN_PATTERN, ' ')

  // 3. Fullwidth space → halfwidth space, collapse runs, trim
  s = s
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 4. Lowercase
  s = s.toLowerCase()

  return s
}
