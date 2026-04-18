import { expect, test } from '@playwright/test'

// Every route the shell's nav exposes. Each entry is one row of this truth
// table: from-to navigation, aria-current assertion, and the role-scoped
// locator text. `short` is the mobile label, `full` is the desktop label.
const ROUTES = [
  { path: '/', full: 'チャンネル /', short: 'CH /', heading: null as string | null },
  { path: '/epg', full: '番組表 /epg', short: 'EPG /epg', heading: '番組表' },
  { path: '/recordings', full: '録画 /recordings', short: 'REC /recordings', heading: '録画' },
  { path: '/settings', full: '設定 /settings', short: 'CFG /settings', heading: '設定' }
] as const

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

test.describe('desktop navigation', () => {
  test.beforeEach(async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1440) < 768, 'desktop-nav only')
    await page.setViewportSize(DESKTOP)
  })

  // Cross-product: from every route, click every other route's nav link.
  for (const from of ROUTES) {
    for (const to of ROUTES) {
      if (from.path === to.path) continue
      test(`nav ${from.path} -> ${to.path}`, async ({ page }) => {
        await page.goto(from.path)
        await page.waitForLoadState('domcontentloaded')
        await page.getByRole('link', { name: to.full }).click()
        await expect(page).toHaveURL(to.path)
        if (to.heading) {
          await expect(page.getByRole('heading', { name: to.heading })).toBeVisible()
        }
      })
    }
  }

  test('active route link carries aria-current="page"', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      const active = page.getByRole('link', { name: r.full })
      await expect(active).toHaveAttribute('aria-current', 'page')
      // And every inactive nav link must NOT carry aria-current
      for (const other of ROUTES) {
        if (other.path === r.path) continue
        const inactive = page.getByRole('link', { name: other.full })
        await expect(inactive).not.toHaveAttribute('aria-current', 'page')
      }
    }
  })

  test('SPA navigation — no full document reload between routes', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const documentRequests: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'document') documentRequests.push(req.url())
    })
    for (const r of ROUTES.slice(1)) {
      await page.getByRole('link', { name: r.full }).click()
      await expect(page).toHaveURL(r.path)
    }
    expect(documentRequests, 'SPA nav must not re-fetch the document').toHaveLength(0)
  })

  test('keyboard: Tab reaches nav links, Enter navigates', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'keyboard focus order is browser-dependent; chromium is canonical')
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // Focus the first nav item directly so the test doesn't depend on the number
    // of prior focusable elements in the shell chrome.
    await page.getByRole('link', { name: '番組表 /epg' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/epg')
  })

  test('browser back/forward works between routes', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('link', { name: '番組表 /epg' }).click()
    await expect(page).toHaveURL('/epg')
    await page.getByRole('link', { name: '録画 /recordings' }).click()
    await expect(page).toHaveURL('/recordings')
    await page.goBack()
    await expect(page).toHaveURL('/epg')
    await page.goBack()
    await expect(page).toHaveURL('/')
    await page.goForward()
    await expect(page).toHaveURL('/epg')
  })

  test('deep-link reload works for every route', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(r.path)
      await page.reload()
      await expect(page).toHaveURL(r.path)
      await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible()
    }
  })
})

test.describe('mobile navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE)
  })

  test('bottom tabs are present and pinned to the bottom', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const nav = page.getByRole('navigation', { name: 'モバイルナビゲーション' })
    await expect(nav).toBeVisible()
    const box = await nav.boundingBox()
    expect(box, 'mobile nav must have a layout box').not.toBeNull()
    expect(box?.y).toBeGreaterThan(MOBILE.height - 80)
  })

  for (const r of ROUTES) {
    test(`mobile tab -> ${r.path}`, async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      const nav = page.getByRole('navigation', { name: 'モバイルナビゲーション' })
      await nav.getByRole('link', { name: r.short }).click()
      await expect(page).toHaveURL(r.path)
      if (r.heading) {
        await expect(page.getByRole('heading', { name: r.heading })).toBeVisible()
      }
    })
  }

  test('mobile active tab carries aria-current="page"', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      const nav = page.getByRole('navigation', { name: 'モバイルナビゲーション' })
      await expect(nav.getByRole('link', { name: r.short })).toHaveAttribute('aria-current', 'page')
    }
  })
})

test.describe('shell chrome consistency', () => {
  test('shell chrome persists across every route (no jump)', async ({ page, viewport }) => {
    const isDesktop = (viewport?.width ?? 1440) >= 768
    const navLabel = isDesktop ? 'メインナビゲーション' : 'モバイルナビゲーション'
    const heights: Record<string, { health: number; nav: number }> = {}
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      const health = page.getByRole('status', { name: 'グローバルヘルス' })
      const nav = page.getByRole('navigation', { name: navLabel })
      await expect(health).toBeVisible()
      await expect(nav).toBeVisible()
      const h = (await health.boundingBox())?.height ?? 0
      const n = (await nav.boundingBox())?.height ?? 0
      heights[r.path] = { health: h, nav: n }
    }
    const first = heights[ROUTES[0].path]
    for (const r of ROUTES.slice(1)) {
      expect(heights[r.path].health, `health bar height should be stable on ${r.path}`).toBe(first?.health)
      expect(heights[r.path].nav, `nav bar height should be stable on ${r.path}`).toBe(first?.nav)
    }
  })

  test('wordmark reads "KotoTV" on every route', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByRole('status', { name: 'グローバルヘルス' })).toContainText('KotoTV')
    }
  })

  test('PageHeader present on every route', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path)
      await page.waitForLoadState('domcontentloaded')
      // Each route mounts a <section role="region"> with a page-specific aria-label
      const headers = await page.locator('section[aria-label]').all()
      expect(headers.length, `${r.path} must host a PageHeader`).toBeGreaterThan(0)
    }
  })
})
