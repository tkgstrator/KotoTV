import { expect, test } from '@playwright/test'

/**
 * Diagnostic: are any label elements inside a <ChannelRow> overlapping each other?
 * Runs pairwise intersection check on visible text nodes within each row.
 */
test('channel row — no label overlaps', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const rows = page.locator('a[aria-label$="を視聴"]')
  const count = await rows.count()
  expect(count).toBeGreaterThan(0)

  type Overlap = { row: number; a: string; b: string; rectA: DOMRect; rectB: DOMRect }
  const overlaps: Overlap[] = []

  const sampleCount = Math.min(count, 6)
  for (let i = 0; i < sampleCount; i++) {
    const row = rows.nth(i)
    const found = await row.evaluate((rowEl) => {
      const texts = Array.from(rowEl.querySelectorAll<HTMLElement>('span')).filter((el) => {
        const s = getComputedStyle(el)
        return s.display !== 'none' && s.visibility !== 'hidden' && (el.innerText ?? '').trim().length > 0
      })
      const res: { a: string; b: string; rectA: DOMRect; rectB: DOMRect }[] = []
      for (let x = 0; x < texts.length; x++) {
        for (let y = x + 1; y < texts.length; y++) {
          const ea = texts[x]
          const eb = texts[y]
          if (!ea || !eb) continue
          if (ea.contains(eb) || eb.contains(ea)) continue
          const ra = ea.getBoundingClientRect()
          const rb = eb.getBoundingClientRect()
          const intersects = ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom
          if (intersects) {
            res.push({ a: ea.innerText.slice(0, 30), b: eb.innerText.slice(0, 30), rectA: ra, rectB: rb })
          }
        }
      }
      return res
    })
    for (const f of found) overlaps.push({ row: i, ...f })
  }

  if (overlaps.length) {
    await test.info().attach('overlaps.json', {
      body: JSON.stringify(overlaps, null, 2),
      contentType: 'application/json'
    })
    await page.screenshot({ path: test.info().outputPath('list.png'), fullPage: true })
  }
  expect(overlaps, 'text label overlaps inside channel rows').toEqual([])
})
