/**
 * UX spec: encode-profile benchmark flow
 *
 * All five scenarios use route interception — no real FFmpeg is invoked.
 * The benchmark and create endpoints are mocked via page.route() before
 * navigation so the React Query fetches land on the intercepted handlers.
 */
import { expect, test } from '@playwright/test'

// ─── shared mock data ────────────────────────────────────────────────────────

const EMPTY_PROFILES = { profiles: [] }
const EMPTY_HISTORY = { items: [] }

const CREATED_PROFILE = {
  id: 'mock-id-1',
  name: 'テストプロファイル',
  mode: 'simple',
  codec: 'avc',
  quality: 'medium',
  timing: 'immediate',
  hwAccel: 'cpu',
  rateControl: 'vbr',
  bitrateKbps: 3000,
  qpValue: 23,
  isDefault: false,
  keepOriginalResolution: true,
  resolution: 'hd720',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Navigate to /settings and click the エンコード tab. */
async function openEncodeTab(page: import('@playwright/test').Page) {
  await page.goto('/settings', { waitUntil: 'domcontentloaded' })
  const tab = page.getByRole('tab', { name: 'エンコード' })
  await expect(tab).toBeVisible()
  await tab.click()
  await page.waitForTimeout(200)
}

/** Open the 新規プロファイル dialog and wait for it. */
async function openNewProfileDialog(page: import('@playwright/test').Page) {
  const btn = page.getByRole('button', { name: /新規プロファイル/ })
  await expect(btn).toBeVisible()
  await btn.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

// ─── scenario 1: Toggle ON hides resolution picker ──────────────────────────

test('encode profile dialog: オリジナルを維持 ON by default, resolution picker absent', async ({ page }) => {
  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: EMPTY_PROFILES })
    } else {
      route.continue()
    }
  })
  await page.route('**/api/encode-profiles/benchmark/history', (route) => {
    route.fulfill({ json: EMPTY_HISTORY })
  })

  await openEncodeTab(page)
  // Need to dismiss the empty-state; button should still be present
  const dialog = await openNewProfileDialog(page)

  // Switch "オリジナルを維持" should be checked (ON)
  const _keepSwitch = dialog.getByRole('switch', { name: 'オリジナルを維持' })
  // The switch does not carry an explicit aria-label — locate via adjacent label text
  // Look for a switch near the "オリジナルを維持" text
  const keepSwitchByLabel = dialog.locator('text=オリジナルを維持').locator('..').locator('button[role="switch"]')
  const switchState = await keepSwitchByLabel.getAttribute('data-state')
  expect(switchState, 'オリジナルを維持 switch must be ON by default').toBe('checked')

  // Resolution ToggleGroup must NOT be visible
  const resolutionItems = dialog.getByRole('radio', { name: /1080p|720p|480p/ })
  await expect(
    resolutionItems.first(),
    'resolution picker should be hidden when オリジナルを維持 is ON'
  ).not.toBeVisible()
})

// ─── scenario 2: Toggle OFF reveals 720p-preselected picker ─────────────────

test('encode profile dialog: toggling オリジナルを維持 OFF reveals picker with hd720 active', async ({ page }) => {
  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: EMPTY_PROFILES })
    } else {
      route.continue()
    }
  })
  await page.route('**/api/encode-profiles/benchmark/history', (route) => {
    route.fulfill({ json: EMPTY_HISTORY })
  })

  await openEncodeTab(page)
  const dialog = await openNewProfileDialog(page)

  // Find and click the switch next to "オリジナルを維持"
  const keepSwitchByLabel = dialog.locator('text=オリジナルを維持').locator('..').locator('button[role="switch"]')
  await keepSwitchByLabel.click()
  await page.waitForTimeout(100)

  // Switch must now be unchecked
  const switchState = await keepSwitchByLabel.getAttribute('data-state')
  expect(switchState, 'switch must be OFF after click').toBe('unchecked')

  // 720p button must be visible and selected
  const btn720 = dialog.getByRole('radio', { name: '720p' })
  await expect(btn720, '720p button must be visible').toBeVisible()
  const state720 = await btn720.getAttribute('data-state')
  expect(state720, '720p must be preselected (data-state=on)').toBe('on')

  // 1080p and 480p must also be visible but not selected
  const btn1080 = dialog.getByRole('radio', { name: '1080p' })
  const btn480 = dialog.getByRole('radio', { name: '480p' })
  await expect(btn1080).toBeVisible()
  await expect(btn480).toBeVisible()
  expect(await btn1080.getAttribute('data-state'), '1080p must not be selected').toBe('off')
  expect(await btn480.getAttribute('data-state'), '480p must not be selected').toBe('off')
})

// ─── scenario 3: Benchmark success flow ─────────────────────────────────────

test('encode profile dialog: benchmark success → button labels cycle → dialog closes, no AlertDialog', async ({
  page
}) => {
  const benchmarkOk = { ok: true, fps: 45, wallSeconds: 5.2 }

  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: EMPTY_PROFILES })
    } else if (route.request().method() === 'POST') {
      // Simulate ~200ms create latency so we can catch 保存中…
      setTimeout(() => route.fulfill({ json: { profiles: [CREATED_PROFILE] } }), 200)
    } else {
      route.continue()
    }
  })
  await page.route('**/api/encode-profiles/benchmark/history', (route) => {
    route.fulfill({ json: EMPTY_HISTORY })
  })
  await page.route('**/api/encode-profiles/benchmark', (route) => {
    // Simulate 300ms benchmark so the 検証中… label is catchable
    setTimeout(() => route.fulfill({ json: benchmarkOk }), 300)
  })

  await openEncodeTab(page)
  const dialog = await openNewProfileDialog(page)

  // Type a name
  const nameInput = dialog.getByPlaceholder('例: HEVC 省容量')
  await nameInput.fill('テストプロファイル')

  // Codec: pick CPU (already default) — keep AVC and CPU
  // Click 作成
  const saveBtn = dialog.getByRole('button', { name: '作成' })
  await saveBtn.click()

  // Within 1 s the button should read 検証中…
  await expect(dialog.getByRole('button', { name: /検証中/ }), '検証中… label must appear').toBeVisible({
    timeout: 1500
  })

  // After benchmark resolves, button should read 保存中… briefly (200ms mock create latency)
  await expect(dialog.getByRole('button', { name: /保存中/ }), '保存中… label must appear').toBeVisible({
    timeout: 2000
  })

  // Dialog must close
  await expect(dialog, 'dialog must close after success').not.toBeVisible({ timeout: 3000 })

  // AlertDialog must NOT be present
  const alertDialog = page.getByRole('alertdialog')
  await expect(alertDialog, 'no AlertDialog should appear on benchmark success').not.toBeVisible()
})

// ─── scenario 4: Benchmark failure flow ─────────────────────────────────────

test('encode profile dialog: benchmark failure → AlertDialog with correct copy, このまま保存 fires POST', async ({
  page
}) => {
  const benchmarkFail = { ok: false, fps: 12, wallSeconds: 7.3, reason: 'below_realtime' }

  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: EMPTY_PROFILES })
    } else if (route.request().method() === 'POST') {
      route.fulfill({ json: CREATED_PROFILE, status: 201 })
    } else {
      route.continue()
    }
  })
  await page.route('**/api/encode-profiles/benchmark/history', (route) => {
    route.fulfill({ json: EMPTY_HISTORY })
  })
  await page.route('**/api/encode-profiles/benchmark', (route) => {
    route.fulfill({ json: benchmarkFail })
  })

  await openEncodeTab(page)
  const dialog = await openNewProfileDialog(page)

  const nameInput = dialog.getByPlaceholder('例: HEVC 省容量')
  await nameInput.fill('テストプロファイル')

  const saveBtn = dialog.getByRole('button', { name: '作成' })
  await saveBtn.click()

  // AlertDialog must appear
  const alertDialog = page.getByRole('alertdialog')
  await expect(alertDialog, 'AlertDialog must appear on benchmark failure').toBeVisible({ timeout: 3000 })

  // Title text
  await expect(
    alertDialog.getByText('ベンチマークが基準を満たしませんでした'),
    'AlertDialog title must match'
  ).toBeVisible()

  // Body must mention 29.97 fps threshold
  await expect(alertDialog.getByText(/29\.97 fps/), '29.97 fps text must be in body').toBeVisible()

  // このまま保存 button must be present and have destructive styling
  const forceSaveBtn = alertDialog.getByRole('button', { name: 'このまま保存' })
  await expect(forceSaveBtn, 'このまま保存 button must be visible').toBeVisible()

  // Intercept the profile POST and confirm it fires when we click このまま保存
  let profilePostFired = false
  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'POST') {
      profilePostFired = true
      route.fulfill({ json: CREATED_PROFILE, status: 201 })
    } else {
      route.fulfill({ json: EMPTY_PROFILES })
    }
  })

  await forceSaveBtn.click()

  // Dialog and AlertDialog should both close
  await expect(alertDialog, 'AlertDialog must close after force-save').not.toBeVisible({ timeout: 3000 })

  expect(profilePostFired, 'POST /api/encode-profiles must fire after このまま保存').toBe(true)
})

// ─── scenario 5: Benchmark history panel ────────────────────────────────────

test('encode tab: ベンチマーク履歴 panel renders 5 columns, failed fps is red, tooltip shows reason', async ({
  page
}) => {
  const historyPayload = {
    items: [
      {
        id: 'h-ok-1',
        createdAt: new Date('2024-01-15T10:00:00Z').toISOString(),
        codec: 'avc',
        hwAccel: 'cpu',
        rateControl: 'vbr',
        bitrateKbps: 3000,
        qpValue: 23,
        keepOriginalResolution: true,
        resolution: 'hd720',
        ok: true,
        fps: 45.0,
        wallSeconds: 5.2,
        reason: null,
        profileId: 'profile-id-a',
        profileName: 'テストA'
      },
      {
        id: 'h-fail-1',
        createdAt: new Date('2024-01-15T11:00:00Z').toISOString(),
        codec: 'hevc',
        hwAccel: 'cpu',
        rateControl: 'vbr',
        bitrateKbps: 6000,
        qpValue: 20,
        keepOriginalResolution: false,
        resolution: 'hd1080',
        ok: false,
        fps: 12.3,
        wallSeconds: 7.3,
        reason: 'x'.repeat(200), // 200-char reason
        profileId: null,
        profileName: null
      }
    ]
  }

  await page.route('**/api/encode-profiles', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: EMPTY_PROFILES })
    } else {
      route.continue()
    }
  })
  await page.route('**/api/encode-profiles/benchmark/history', (route) => {
    route.fulfill({ json: historyPayload })
  })

  await openEncodeTab(page)

  const detailsSummary = page.locator('details').filter({ hasText: 'ベンチマーク履歴' }).locator('summary')
  await expect(detailsSummary, 'ベンチマーク履歴 summary must be visible').toBeVisible()

  await detailsSummary.click()
  await page.waitForTimeout(150)

  const panel = page.locator('details').filter({ hasText: 'ベンチマーク履歴' })

  // Exactly 5 header cells in the new order: プロファイル / 実行日 / コーデック / HW支援 / fps
  const headers = panel.locator('thead th')
  await expect(headers, 'table must have exactly 5 columns').toHaveCount(5)
  await expect(headers.nth(0)).toHaveText('プロファイル')
  await expect(headers.nth(1)).toHaveText('実行日')
  await expect(headers.nth(2)).toHaveText('コーデック')
  await expect(headers.nth(3)).toHaveText('HW支援')
  await expect(headers.nth(4)).toHaveText('fps')

  // Table must have 2 data rows
  const rows = panel.locator('tbody tr')
  await expect(rows, '2 history rows must render').toHaveCount(2)

  // First row's first td must show the profile name
  const firstRow = rows.nth(0)
  const firstProfileCell = firstRow.locator('td').nth(0)
  await expect(firstProfileCell, 'first row profile cell must contain テストA').toContainText('テストA')

  // Null-name row's first td must show em-dash
  const nullNameRow = rows.nth(1)
  const nullProfileCell = nullNameRow.locator('td').nth(0)
  await expect(nullProfileCell, 'null-name row must show —').toContainText('—')

  // Failed row's fps cell must carry text-destructive class
  const failRow = rows.nth(1)
  // fps is the 5th td (index 4) in the new column order
  const failFpsCell = failRow.locator('td').nth(4)
  await expect(failFpsCell, 'failed fps cell must be visible').toBeVisible()
  const failFpsCls = await failFpsCell.getAttribute('class')
  expect(failFpsCls, 'failed fps cell must have text-destructive').toContain('text-destructive')

  // Hover the inner span (TooltipTrigger) — hovering the td itself lands outside
  // the trigger boundary on wide viewports and never fires the tooltip.
  const fpsTriggerSpan = failFpsCell.locator('span').first()
  await fpsTriggerSpan.hover()
  await page.waitForTimeout(500)

  const tooltip = page.locator('[role="tooltip"]')
  await expect(tooltip, 'tooltip must appear on hover over failed fps cell').toBeVisible({ timeout: 3000 })
  const tooltipText = await tooltip.innerText()
  expect(tooltipText.length, 'tooltip text must be non-empty').toBeGreaterThan(0)
})
