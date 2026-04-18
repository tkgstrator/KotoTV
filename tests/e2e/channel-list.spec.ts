import { expect, test } from '@playwright/test'

test('channel list renders at least one row', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Channel rows are <a aria-label="... を視聴"> (see ChannelRow.tsx).
  const rows = page.locator('a[aria-label$="を視聴"]')
  await expect(rows.first()).toBeVisible()
})

test('scroll keeps sticky headers pinned', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const header = page.locator('[data-testid="channel-list-header"]').first()
  if (!(await header.count())) test.skip(true, 'no sticky header marker yet')
  const beforeY = (await header.boundingBox())?.y ?? 0
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(200)
  const afterY = (await header.boundingBox())?.y ?? 0
  expect(Math.abs(afterY - beforeY)).toBeLessThan(4)
})
