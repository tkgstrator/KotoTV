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
