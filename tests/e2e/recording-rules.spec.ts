import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureWebp } from './helpers/webp'

const SCREENSHOT_DIR = join(__dirname, '..', '.artifacts', 'screenshots')

async function waitForRulesLoaded(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-slot="skeleton"]').first()).not.toBeVisible({ timeout: 10_000 })
}

test.describe
  .serial('recording rule CRUD', () => {
    const RULE_NAME = `__e2e_crud_${Date.now()}`
    let updatedName: string

    test.afterAll(async ({ browser }) => {
      const page = await browser.newPage()
      await page.goto('/')
      try {
        await page.evaluate(async () => {
          const res = await fetch('/api/recording-rules')
          const { rules } = await res.json()
          for (const rule of rules) {
            if (rule.name.startsWith('__e2e_')) {
              await fetch(`/api/recording-rules/${rule.id}`, { method: 'DELETE' })
            }
          }
        })
      } catch {}
      await page.close()
    })

    test('create a recording rule', async ({ page }) => {
      await page.goto('/recordings/rules/new')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await page.locator('input[name="name"]').fill(RULE_NAME)
      await page.locator('input[name="keyword"]').fill('テスト番組')

      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-create-filled.webp'), { fullPage: true })

      await page.getByRole('button', { name: '作成' }).click()
      await expect(page).toHaveURL('/recordings/rules', { timeout: 15_000 })
      await waitForRulesLoaded(page)

      const editBtn = page.getByLabel(`ルール「${RULE_NAME}」を編集`)
      await expect(editBtn).toBeVisible()
      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-created.webp'))
    })

    test('edit the recording rule', async ({ page }) => {
      await page.goto('/recordings/rules')
      await page.waitForLoadState('domcontentloaded')
      await waitForRulesLoaded(page)

      const editBtn = page.getByLabel(`ルール「${RULE_NAME}」を編集`)
      await expect(editBtn).toBeVisible()
      await editBtn.click()
      await expect(page).toHaveURL(/\/recordings\/rules\//, { timeout: 10_000 })

      const nameInput = page.locator('input[name="name"]')
      await expect(nameInput).toBeVisible({ timeout: 15_000 })
      await expect(nameInput).toHaveValue(RULE_NAME, { timeout: 15_000 })

      updatedName = `${RULE_NAME}_upd`
      await nameInput.fill(updatedName)

      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-edit-filled.webp'), { fullPage: true })

      await page.getByRole('button', { name: '更新' }).click()
      await expect(page).toHaveURL('/recordings/rules', { timeout: 15_000 })
      await waitForRulesLoaded(page)

      await expect(page.getByLabel(`ルール「${updatedName}」を編集`)).toBeVisible()
      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-updated.webp'))
    })

    test('delete the recording rule', async ({ page }) => {
      const targetName = updatedName || RULE_NAME
      await page.goto('/recordings/rules')
      await page.waitForLoadState('domcontentloaded')
      await waitForRulesLoaded(page)

      const editBtn = page.getByLabel(new RegExp(`ルール「${targetName}」を編集`))
      await expect(editBtn).toBeVisible()

      const deleteBtn = editBtn.locator('..').getByLabel('ルール削除')
      await deleteBtn.click()

      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-delete-confirm.webp'))

      await confirmDialog.getByRole('button', { name: '削除' }).click()
      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(editBtn).not.toBeVisible({ timeout: 10_000 })
      await captureWebp(page, join(SCREENSHOT_DIR, 'rule-deleted.webp'))
    })
  })

test.describe('recording rule misc', () => {
  test('rule form cancel returns to list', async ({ page }) => {
    await page.goto('/recordings/rules/new')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'キャンセル' }).click()
    await expect(page).toHaveURL('/recordings/rules')
  })

  test('rule enabled toggle persists via API', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Create via API
    const rule = await page.evaluate(async () => {
      const res = await fetch('/api/recording-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `__e2e_toggle_${Date.now()}`,
          enabled: true,
          keyword: null,
          keywordMode: 'literal',
          keywordTarget: 'title',
          excludeKeyword: null,
          channelIds: [],
          genres: [],
          dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
          timeStartMinutes: null,
          timeEndMinutes: null,
          priority: 50,
          avoidDuplicates: true,
          excludeReruns: false,
          newOnly: false,
          marginStartMinutes: 0,
          marginEndMinutes: 0,
          minDurationMinutes: 0,
          keepLatestN: 0,
          encodeProfileId: null
        })
      })
      return res.json()
    })

    await page.goto('/recordings/rules')
    await page.waitForLoadState('domcontentloaded')
    await waitForRulesLoaded(page)

    const editBtn = page.getByLabel(new RegExp(`ルール「${rule.name}」を編集`))
    await expect(editBtn).toBeVisible()

    const toggle = editBtn.locator('..').getByLabel(/無効にする|有効にする/)
    await toggle.click()
    await page.waitForTimeout(1000)

    // Verify via API
    const updatedRule = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recording-rules/${id}`)
      if (!res.ok) return { error: res.status }
      return res.json()
    }, rule.id)

    expect(updatedRule).not.toHaveProperty('error')
    expect(updatedRule.enabled).toBe(false)
    await captureWebp(page, join(SCREENSHOT_DIR, 'rule-toggled.webp'))

    // Cleanup
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recording-rules/${id}`, { method: 'DELETE' })
    }, rule.id)
  })
})
