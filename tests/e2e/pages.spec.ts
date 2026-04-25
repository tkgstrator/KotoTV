import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureWebp } from './helpers/webp'

const SCREENSHOT_DIR = join(__dirname, '..', '.artifacts', 'screenshots')

const ALL_PAGES = [
  { path: '/', name: 'channels' },
  { path: '/epg', name: 'epg' },
  { path: '/recordings', name: 'recordings' },
  { path: '/recordings/rules', name: 'recording-rules' },
  { path: '/recordings/rules/new', name: 'recording-rule-new' },
  { path: '/settings', name: 'settings' }
] as const

test.describe('all pages render correctly', () => {
  for (const pg of ALL_PAGES) {
    test(`${pg.path} renders without errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto(pg.path)
      await page.waitForLoadState('networkidle')

      await captureWebp(page, join(SCREENSHOT_DIR, `${pg.name}.webp`), { fullPage: true })

      expect(errors, `page errors on ${pg.path}`).toEqual([])

      await expect(page.locator('header')).toBeVisible()
      await expect(page.locator('main')).toBeVisible()
    })
  }

  test('channel list renders watch links', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const rows = page.locator('a[aria-label$="を視聴"]')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('EPG renders the program grid', async ({ page }) => {
    await page.goto('/epg')
    await page.waitForLoadState('networkidle')
    const tablist = page.getByRole('tablist')
    await expect(tablist).toBeVisible()
  })

  test('settings renders tabs', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    const tablist = page.getByRole('tablist')
    await expect(tablist).toBeVisible()
  })

  test('recordings page renders content', async ({ page }) => {
    await page.goto('/recordings')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
  })
})
