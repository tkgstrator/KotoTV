import type { Page } from '@playwright/test'

export type OverflowIssue = {
  selector: string
  reason: 'text-clipped' | 'offscreen'
  rect: { x: number; y: number; width: number; height: number }
  text?: string
}

/**
 * Detect elements whose content overflows their box (clipped text, rogue
 * horizontal scroll, or content pushed outside the viewport).
 * Intentionally conservative — returns candidates, not verdicts.
 */
export async function findOverflowIssues(page: Page): Promise<OverflowIssue[]> {
  return await page.evaluate(() => {
    const issues: OverflowIssue[] = []
    const vw = document.documentElement.clientWidth
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    for (const el of nodes) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const r = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      const sel = el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}.${el.className.toString().trim().split(/\s+/).slice(0, 3).join('.')}`

      // Skip intentional clamps: line-clamp (-webkit-box) and truncate (ellipsis).
      const isLineClamp = style.display === '-webkit-box' || style.webkitLineClamp !== 'none'
      const hasEllipsis = style.textOverflow === 'ellipsis'

      // Text clipped by fixed height + overflow hidden, with no clamp / ellipsis signal.
      if (el.scrollHeight > el.clientHeight + 1 && style.overflowY === 'hidden' && !hasEllipsis && !isLineClamp) {
        issues.push({ selector: sel, reason: 'text-clipped', rect: r, text: el.innerText.slice(0, 60) })
      }
      // Content pushed past viewport horizontally — real UX break, not intrinsic-text noise.
      if (rect.right > vw + 1 && style.position !== 'fixed' && style.position !== 'sticky') {
        issues.push({ selector: sel, reason: 'offscreen', rect: r })
      }
    }
    return issues
  })
}

export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}
