import { expect, test } from '@playwright/test'

/**
 * Sticky section header must be fully opaque so scrolled rows don't show through.
 * This guards against Tailwind v4 regressions where `bg-background` loses its
 * design-token mapping and silently resolves to transparent.
 */
test('section header bg-background is opaque', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const bg = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('section > div.sticky')
    return el ? getComputedStyle(el).backgroundColor : null
  })
  expect(bg).not.toBeNull()
  // rgba(0,0,0,0) / transparent are regressions.
  expect(bg).not.toMatch(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/)
  expect(bg).not.toBe('transparent')
})

test('scrolled row content does not bleed through sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() =>
    window.scrollTo(0, Math.max(100, document.documentElement.scrollHeight - window.innerHeight))
  )
  await page.waitForTimeout(150)

  // Check: any span inside a channel row whose rect intersects the sticky
  // section header must be covered (not visible) — i.e. the header is on top.
  const bleeds = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('section > div.sticky')
    if (!header) return []
    const hRect = header.getBoundingClientRect()
    const rows = Array.from(document.querySelectorAll<HTMLElement>('a[aria-label$="を視聴"]'))
    const hits: { text: string; y: number }[] = []
    for (const row of rows) {
      const rRect = row.getBoundingClientRect()
      // Does the row visually overlap the sticky header band?
      if (rRect.top < hRect.bottom && rRect.bottom > hRect.top) {
        // Pick a point inside the header where the row would paint if on top.
        const cx = hRect.left + hRect.width / 2
        const cy = (Math.max(hRect.top, rRect.top) + Math.min(hRect.bottom, rRect.bottom)) / 2
        const topEl = document.elementFromPoint(cx, cy)
        if (topEl && row.contains(topEl)) {
          hits.push({ text: row.getAttribute('aria-label') ?? '', y: cy })
        }
      }
    }
    return hits
  })
  expect(bleeds, 'row text visible through sticky section header').toEqual([])
})
