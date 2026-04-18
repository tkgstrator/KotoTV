import { expect, test } from '@playwright/test'

test('html element carries data-theme="tech"', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(theme).toBe('tech')
})

test('--radius-status resolves to 3px', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--radius-status').trim()
  )
  expect(value).toBe('3px')
})

test('layout vars (--shell-offset etc.) resolve from the active theme', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const vars = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return {
      shellOffset: s.getPropertyValue('--shell-offset').trim(),
      healthBar: s.getPropertyValue('--shell-health-bar-h').trim(),
      navBar: s.getPropertyValue('--shell-nav-bar-h').trim(),
      diagSidebar: s.getPropertyValue('--diag-sidebar-w').trim(),
      nowStrip: s.getPropertyValue('--now-strip-h').trim()
    }
  })
  // Don't hardcode px — themes are allowed to change these. Just assert non-empty.
  for (const [name, v] of Object.entries(vars)) {
    expect(v, `layout var ${name} must resolve`).not.toBe('')
  }
})

test('shell chrome is constant — --shell-offset does not react to data-mode', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // Earlier drafts let /live/:id collapse --shell-offset to 40px, but that
  // introduced jumps on navigation. Chrome stays 72px on every route.
  const { before, after } = await page.evaluate(() => {
    const root = document.documentElement
    const read = () => getComputedStyle(root).getPropertyValue('--shell-offset').trim()
    const b = read()
    root.setAttribute('data-mode', 'player')
    const a = read()
    root.removeAttribute('data-mode')
    return { before: b, after: a }
  })
  expect(before).toBe(after)
})

test('status chip renders with monospace font family', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const chipLocator = page.locator('[class*="font-mono"]').first()
  const count = await chipLocator.count()
  if (count === 0) {
    test.skip(true, 'no font-mono element on index route — skip font check')
    return
  }

  const fontFamily = await chipLocator.evaluate((el) => getComputedStyle(el).fontFamily)
  const isMonospace =
    /mono|Menlo|Consolas|Courier|JetBrains|Fira/.test(fontFamily) || fontFamily.includes('ui-monospace')
  expect(isMonospace, `expected monospace font, got: ${fontFamily}`).toBe(true)
})
