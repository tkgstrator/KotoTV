import { expect, test } from '@playwright/test'

/**
 * Visual snapshot baseline for the channel list.
 * First run: creates `__screenshots__/`. Later runs compare pixel-wise.
 * When the design changes intentionally, re-run with `--update-snapshots`.
 */
test('channel list — visual baseline', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('channel-list.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.02
  })
})
