import { expect, test } from '@playwright/test'

/**
 * Visual baseline for /live/$channelId in its loading state (stub backend
 * returns 503 for playlist → HLS sits in 'waiting for playlist' forever,
 * which is the deterministic state we can compare against). Once Mirakc is
 * wired up, add a second spec asserting the ready state separately.
 */
test('live page — loading state baseline', async ({ page }) => {
  await page.goto('/live/GR0')
  await page.waitForLoadState('networkidle')
  // Mask the ticking clock + dynamically-rendered session id so the
  // snapshot is stable.
  await expect(page).toHaveScreenshot('live-loading.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
    mask: [
      page.locator('header span.font-mono.tabular-nums').last(),
      page.locator('aside[aria-label="診断情報パネル"] span', { hasText: /[a-f0-9]{8}…/ }),
      page.locator('aside[aria-label="診断情報パネル"] span', { hasText: /^\d{2}:\d{2}:\d{2}$/ }),
      page.locator('[class*="animate-spin"]')
    ]
  })
})
