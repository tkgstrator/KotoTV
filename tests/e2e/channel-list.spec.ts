import { expect, test } from '@playwright/test'

test('channel list renders at least one row', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Heuristic anchor: a channel row is any element carrying a channel service id.
  const rows = page.locator('[data-channel-id], [data-testid="channel-row"]')
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
