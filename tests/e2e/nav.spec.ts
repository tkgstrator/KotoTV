import { expect, test } from '@playwright/test'

test('clicking 番組表 nav item navigates to /epg and renders placeholder', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1440) < 768, 'desktop nav only — mobile variant covered below')
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByRole('link', { name: '番組表 /epg' }).click()

  await expect(page).toHaveURL('/epg')
  await expect(page.getByRole('heading', { name: '番組表' })).toBeVisible()
  await expect(page.getByText('Phase 3', { exact: true })).toBeVisible()
})

test('clicking チャンネル nav item returns to / without full reload', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1440) < 768, 'desktop nav only — mobile variant covered below')
  await page.goto('/epg')
  await page.waitForLoadState('networkidle')

  const navRequests: string[] = []
  page.on('request', (req) => {
    if (req.resourceType() === 'document') navRequests.push(req.url())
  })

  await page.getByRole('link', { name: 'チャンネル /' }).first().click()

  await expect(page).toHaveURL('/')
  expect(navRequests).toHaveLength(0)
})

test('mobile viewport: bottom tabs are visible and reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const bottomNav = page.getByRole('navigation', { name: 'モバイルナビゲーション' })
  await expect(bottomNav).toBeVisible()

  for (const label of ['CH /', 'EPG /epg', 'REC /recordings', 'CFG /settings']) {
    await expect(bottomNav.getByRole('link', { name: label })).toBeVisible()
  }
})

test('mobile: tapping EPG bottom tab navigates to /epg', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByRole('navigation', { name: 'モバイルナビゲーション' }).getByRole('link', { name: 'EPG /epg' }).click()

  await expect(page).toHaveURL('/epg')
  await expect(page.getByText('Phase 3', { exact: true })).toBeVisible()
})
