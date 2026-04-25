import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureWebp } from './helpers/webp'

const SCREENSHOT_DIR = join(__dirname, '..', '.artifacts', 'screenshots')

test.describe('navigation flows', () => {
  test('channels -> live player -> back', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const watchLink = page.getByRole('link', { name: /を視聴/ }).first()
    if (await watchLink.isVisible()) {
      const href = await watchLink.getAttribute('href')
      await watchLink.click()
      await expect(page).toHaveURL(/\/live\//)
      await captureWebp(page, join(SCREENSHOT_DIR, 'flow-live-player.webp'))

      await page.goBack()
      await expect(page).toHaveURL('/')
    }
  })

  test('recordings -> rules -> new rule -> cancel -> back to list', async ({ page }) => {
    await page.goto('/recordings/rules')
    await page.waitForLoadState('networkidle')
    await captureWebp(page, join(SCREENSHOT_DIR, 'flow-rules-list.webp'))

    const newBtn = page.getByRole('link', { name: /新規ルール/ })
    await expect(newBtn).toBeVisible()
    await newBtn.click()
    await expect(page).toHaveURL('/recordings/rules/new')
    await captureWebp(page, join(SCREENSHOT_DIR, 'flow-rule-new.webp'))

    const cancelBtn = page.getByRole('button', { name: 'キャンセル' })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()
    await expect(page).toHaveURL('/recordings/rules')
  })

  test('settings tabs switch content', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const tablist = page.getByRole('tablist')
    await expect(tablist).toBeVisible()

    const tabs = await tablist.getByRole('tab').all()
    expect(tabs.length).toBeGreaterThanOrEqual(2)

    for (let i = 0; i < tabs.length; i++) {
      await tabs[i].click()
      await page.waitForTimeout(300)
      await captureWebp(page, join(SCREENSHOT_DIR, `flow-settings-tab-${i}.webp`))
    }
  })

  test('recording sub-tabs navigate correctly', async ({ page }) => {
    await page.goto('/recordings')
    await page.waitForLoadState('networkidle')

    const links = page.getByRole('link').filter({ hasText: /録画ルール|録画予約/ })
    if ((await links.count()) > 0) {
      await links.first().click()
      await page.waitForLoadState('networkidle')
      await captureWebp(page, join(SCREENSHOT_DIR, 'flow-recording-sub.webp'))
    }
  })
})
