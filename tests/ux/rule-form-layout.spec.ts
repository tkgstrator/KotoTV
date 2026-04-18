import { expect, test } from '@playwright/test'

/**
 * Rule form pane widths must not shift when the preview content changes.
 * Earlier flex layout let the grid container size itself to its content, so
 * going from empty state ("$ fill in keyword...") to a loaded preview
 * grew the container, which in turn widened the form pane. Grid columns
 * with an explicit `lg:grid lg:grid-cols-[55%_45%]` + `w-full` on the
 * container pin the split.
 */
test('rule editor panes stay at 55/45 when preview content changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/recordings/rules/new')
  await page.waitForLoadState('domcontentloaded')

  const formPane = page.locator('form').first().locator('..')
  const previewPane = page.getByText('PREVIEW (今週のヒット)').locator('..').locator('..')

  const formBefore = await formPane.boundingBox()
  const previewBefore = await previewPane.boundingBox()

  // Trigger preview content change: check one channel
  await page.getByText('NHK総合').first().click()
  await page.waitForTimeout(700) // allow preview debounce + fetch

  const formAfter = await formPane.boundingBox()
  const previewAfter = await previewPane.boundingBox()

  expect(formBefore?.width, 'form pane width must not change').toBe(formAfter?.width)
  expect(previewBefore?.width, 'preview pane width must not change').toBe(previewAfter?.width)
})
