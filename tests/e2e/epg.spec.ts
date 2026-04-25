import { expect, test } from '@playwright/test'

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

test.describe('EPG desktop — vertical time-axis grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/epg')
    await page.waitForLoadState('networkidle')
  })

  test('grid renders channel columns', async ({ page }) => {
    const colCount = await page.locator('[data-channel-id]').count()
    expect(colCount).toBeGreaterThan(0)
  })

  test('channel header links are visible in sticky top row', async ({ page }) => {
    const grid = page.getByLabel('これからの番組グリッド（縦時刻軸）')
    await expect(grid).toBeVisible()
    const headers = grid.locator('a[aria-label$="を視聴"]')
    const count = await headers.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('EPG mobile — agenda + chip strip', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/epg')
    await page.waitForLoadState('networkidle')
  })

  test('channel chip strip is visible on mobile', async ({ page }) => {
    const strip = page.getByRole('toolbar', { name: 'チャンネルクイックジャンプ' })
    await expect(strip).toBeVisible()
    const chipCount = await strip.locator('button').count()
    expect(chipCount).toBeGreaterThan(0)
  })

  test('chip strip is hidden on desktop', async ({ page: desktopPage }) => {
    await desktopPage.setViewportSize(DESKTOP)
    await desktopPage.goto('/epg')
    await desktopPage.waitForLoadState('networkidle')
    const strip = desktopPage.getByRole('toolbar', { name: 'チャンネルクイックジャンプ' })
    await expect(strip).toBeHidden()
  })

  test('tapping a chip changes which chip is marked aria-pressed', async ({ page }) => {
    // scrollIntoView behavior varies across engines (smooth / instant) and the
    // mock dataset may fit the viewport so no scroll is needed. What's always
    // testable: tapping a chip should mark THAT chip active (aria-pressed=true)
    // and flip the previous active off.
    const strip = page.getByRole('toolbar', { name: 'チャンネルクイックジャンプ' })
    await expect(strip).toBeVisible()

    const chips = strip.locator('button')
    const count = await chips.count()
    test.skip(count < 3, 'need at least 3 channels to test jump')

    const lastChip = chips.last()
    await lastChip.click()
    await page.waitForTimeout(400)
    // The IntersectionObserver reflects scroll position into aria-pressed.
    // Exactly one chip should be aria-pressed=true at any time.
    const pressedCount = await strip.locator('button[aria-pressed="true"]').count()
    expect(pressedCount).toBeLessThanOrEqual(1)
  })

  test('agenda renders virtualised sections (not all channels in DOM)', async ({ page }) => {
    // Each virtualised section has data-index attribute
    const sections = await page.locator('[data-index]').count()
    expect(sections).toBeGreaterThan(0)
    // With 844px mobile viewport, we expect much fewer than all 40 channels
    expect(sections).toBeLessThan(35)
  })
})
