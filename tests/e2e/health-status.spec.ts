import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureWebp } from './helpers/webp'

const SCREENSHOT_DIR = join(__dirname, '..', '.artifacts', 'screenshots')

test.describe('health and status', () => {
  test('settings status tab shows subsystem info', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const statusTab = page.getByRole('tab', { name: /ステータス|状態/i })
    if (await statusTab.isVisible()) {
      await statusTab.click()
      await page.waitForTimeout(500)
    }

    await captureWebp(page, join(SCREENSHOT_DIR, 'health-status-tab.webp'))
  })

  test('API health endpoint returns all subsystems', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('mirakc')
    expect(body).toHaveProperty('postgres')
    expect(body).toHaveProperty('ffmpeg')
    expect(body).toHaveProperty('tuners')
    expect(body).toHaveProperty('disk')

    expect(body.mirakc.status).toBe('ok')
    expect(body.postgres.status).toBe('ok')
    expect(body.ffmpeg.status).toBe('ok')
  })

  test('API channels endpoint returns channels', async ({ request }) => {
    const res = await request.get('/api/channels')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.channels.length).toBeGreaterThan(0)
  })

  test('API programs endpoint returns programs', async ({ request }) => {
    const now = new Date()
    const startAt = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString()

    const res = await request.get(`/api/programs?startAt=${startAt}&endAt=${endAt}`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.programs.length).toBeGreaterThan(0)
  })
})
