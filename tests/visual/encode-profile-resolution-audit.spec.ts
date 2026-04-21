/**
 * Visual audit: encode-profile resolution row + benchmark history panel.
 * Screenshots are committed as baselines to tests/visual/.
 * Uses the real dev server — no mocking.
 */
import path from 'node:path'
import { expect, test } from '@playwright/test'

const OUT = path.resolve('/home/vscode/app/tests/visual')

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

test.describe('encode profile resolution + benchmark history visual audit', () => {
  test('1. dialog default state: オリジナルを維持 ON, resolution row visible', async ({ page }) => {
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'エンコード' }).click()
    await page.waitForTimeout(400)

    await page.getByRole('button', { name: /新規プロファイル/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 6000 })
    await page.waitForTimeout(300)

    await page.screenshot({
      path: path.join(OUT, 'encode-profile-resolution-default.png'),
      fullPage: false,
      type: 'png'
    })
  })

  test('2. dialog with オリジナルを維持 OFF: 1080p/720p/480p picker visible', async ({ page }) => {
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'エンコード' }).click()
    await page.waitForTimeout(400)

    await page.getByRole('button', { name: /新規プロファイル/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 6000 })

    // Toggle the switch to OFF
    const keepSwitch = dialog.locator('text=オリジナルを維持').locator('..').locator('button[role="switch"]')
    await keepSwitch.click()
    await page.waitForTimeout(200)

    await page.screenshot({
      path: path.join(OUT, 'encode-profile-resolution-picker.png'),
      fullPage: false,
      type: 'png'
    })
  })

  test('3. benchmark history collapsed', async ({ page }) => {
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'エンコード' }).click()
    await page.waitForTimeout(400)

    await page.screenshot({
      path: path.join(OUT, 'encode-profile-history-collapsed.png'),
      fullPage: false,
      type: 'png'
    })
  })

  test('4. benchmark history expanded', async ({ page }) => {
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'エンコード' }).click()
    await page.waitForTimeout(400)

    const summary = page.locator('details').filter({ hasText: 'ベンチマーク履歴' }).locator('summary')
    await expect(summary).toBeVisible()
    await summary.click()
    await page.waitForTimeout(250)

    await page.screenshot({
      path: path.join(OUT, 'encode-profile-history-expanded.png'),
      fullPage: false,
      type: 'png'
    })
  })
})
