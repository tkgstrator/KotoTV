import { expect, test } from '@playwright/test'
import { collectConsoleErrors, findOverflowIssues } from './helpers'

const ROUTES = ['/']

for (const path of ROUTES) {
  test(`ux audit: ${path}`, async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const issues = await findOverflowIssues(page)
    if (issues.length) {
      await test.info().attach('overflow-issues.json', {
        body: JSON.stringify(issues, null, 2),
        contentType: 'application/json'
      })
    }
    expect.soft(issues, 'overflow/clipping candidates').toEqual([])
    expect.soft(errors, 'console errors').toEqual([])
  })
}
