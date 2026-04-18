import { test } from '@playwright/test'
import { captureWebp } from './_webp'

test('zoom on GR 2-row area', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/recordings/rules/new')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)

  // Find y range: from GR header to bottom of last GR channel row
  const grHeader = page.getByText('地上波 (GR)').first()
  const lastGr = page.getByText('TOKYO MX').first()
  const headerBox = await grHeader.boundingBox()
  const lastBox = await lastGr.boundingBox()
  if (!headerBox || !lastBox) return

  await page.screenshot({
    path: test.info().outputPath('gr.png'),
    clip: {
      x: 0,
      y: Math.max(0, headerBox.y - 10),
      width: 800,
      height: lastBox.y + lastBox.height - headerBox.y + 20
    }
  })
})
