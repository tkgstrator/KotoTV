import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureWebp } from './helpers/webp'

const SCREENSHOT_DIR = join(__dirname, '..', '.artifacts', 'screenshots')
const PROFILE_NAME = `__e2e_profile_${Date.now()}`

async function goToEncodeTab(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  const encodeTab = page.getByRole('tab', { name: /エンコード/i })
  if (await encodeTab.isVisible()) {
    await encodeTab.click()
    await page.waitForTimeout(500)
  }
}

function profileRow(page: import('@playwright/test').Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "flex items-center gap-3")]')
}

test.describe('encode profile CRUD', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await page.goto('/')
    try {
      await page.evaluate(async () => {
        const res = await fetch('/api/encode-profiles')
        const { profiles } = await res.json()
        for (const p of profiles) {
          if (p.name.startsWith('__e2e_')) {
            await fetch(`/api/encode-profiles/${p.id}`, { method: 'DELETE' })
          }
        }
      })
    } catch {}
    await page.close()
  })

  test('create, edit, and delete an encode profile', async ({ page }) => {
    await goToEncodeTab(page)

    // --- Create ---
    const createBtn = page.getByRole('button', { name: /新規プロファイル/ })
    await expect(createBtn).toBeVisible()
    await createBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例: HEVC 省容量').fill(PROFILE_NAME)
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-create-dialog.webp'))

    const saveBtn = dialog.getByRole('button', { name: /作成|保存/ })
    await saveBtn.click()

    // Benchmark may show a warning dialog — click "このまま保存" if it appears
    const saveAnywayBtn = page.getByRole('button', { name: 'このまま保存' })
    try {
      await saveAnywayBtn.waitFor({ state: 'visible', timeout: 120_000 })
      await saveAnywayBtn.click()
    } catch {
      // No benchmark warning — dialog closed normally
    }

    await expect(dialog).not.toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)

    await expect(profileRow(page, PROFILE_NAME).getByLabel('編集')).toBeVisible({ timeout: 10_000 })
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-created.webp'))

    // --- Edit ---
    const editBtn = profileRow(page, PROFILE_NAME).getByLabel('編集')
    await editBtn.click()

    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()

    const nameInput = editDialog.getByPlaceholder('例: HEVC 省容量')
    await expect(nameInput).toHaveValue(PROFILE_NAME)

    const updatedName = `${PROFILE_NAME}_upd`
    await nameInput.fill(updatedName)
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-edit-dialog.webp'))

    const updateBtn = editDialog.getByRole('button', { name: /更新|保存/ })
    await updateBtn.click()

    // Benchmark warning may appear again on edit
    const saveAnywayBtn2 = page.getByRole('button', { name: 'このまま保存' })
    try {
      await saveAnywayBtn2.waitFor({ state: 'visible', timeout: 120_000 })
      await saveAnywayBtn2.click()
    } catch {}

    await expect(editDialog).not.toBeVisible({ timeout: 30_000 })
    await expect(profileRow(page, updatedName).getByLabel('編集')).toBeVisible({ timeout: 10_000 })
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-updated.webp'))

    // --- Delete ---
    const deleteBtn = profileRow(page, updatedName).getByLabel('削除')
    await deleteBtn.click()

    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-delete-confirm.webp'))

    await confirmDialog.getByRole('button', { name: '削除' }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 })
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-deleted.webp'))
  })

  test('encode profile dialog cancel does not create', async ({ page }) => {
    await goToEncodeTab(page)

    const createBtn = page.getByRole('button', { name: /新規プロファイル/ })
    await createBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const cancelName = `__e2e_cancel_${Date.now()}`
    await dialog.getByPlaceholder('例: HEVC 省容量').fill(cancelName)

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(cancelName)).not.toBeVisible()
  })

  test('encode profile list shows at least one profile', async ({ page }) => {
    await goToEncodeTab(page)

    const editBtns = page.getByLabel('編集')
    await expect(editBtns.first()).toBeVisible({ timeout: 10_000 })
    expect(await editBtns.count()).toBeGreaterThan(0)
    await captureWebp(page, join(SCREENSHOT_DIR, 'profile-list.webp'))
  })
})
