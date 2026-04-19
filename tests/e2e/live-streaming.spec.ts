/**
 * live-streaming.spec.ts
 *
 * Playwright E2E tests covering the 12 acceptance criteria from
 * docs/plans/phase-2-live-hls.md §追加要件 (2026-04-19).
 *
 * Environment contract:
 *   - Vite client at http://localhost:5173 (baseURL in playwright.config.ts)
 *   - Backend at http://localhost:11575, proxied through Vite as /api/*
 *   - Mirakc container running; real HLS playback requires a hardware tuner.
 *     When no tuner is present, POST /api/streams/live/:id returns 503.
 *     Tests that require actual video playback are annotated with
 *     test.fixme(noTuner, '...') so they surface as "expected failure" in CI
 *     and pass fully when run against real hardware.
 *   - HW accel tests are skipped unless process.env.HW_ACCEL_TYPE === 'nvenc'.
 *
 * Run:
 *   bunx playwright test --project=desktop-chromium tests/e2e/live-streaming.spec.ts
 */

import { expect, test } from '@playwright/test'
import {
  fetchStreamInfoOnce,
  getCurrentTime,
  getVideoMuted,
  pickFirstChannelId,
  pickTwoChannelIds,
  releaseSession,
  startLiveSession,
  waitForPlaying
} from './helpers/live-stream'

// ---------------------------------------------------------------------------
// Shared fixture: detect tuner availability once for the whole suite.
// We do a quick POST and check whether we get 201 (tuner present) or 503
// (no tuner / Mirakc unavailable). This drives test.fixme annotations.
// ---------------------------------------------------------------------------

let _tunerAvailable: boolean | undefined

async function isTunerAvailable(request: Parameters<typeof startLiveSession>[0]): Promise<boolean> {
  if (_tunerAvailable !== undefined) return _tunerAvailable
  // GET channels first so we have a valid channelId
  const res = await request.get('/api/channels')
  const body = await res.json()
  const channelId = String(body.channels?.[0]?.id ?? '')
  if (!channelId) {
    _tunerAvailable = false
    return false
  }

  const session = await startLiveSession(request, channelId, 'avc', 'mid')
  if (session) {
    await releaseSession(request, session.sessionId)
    _tunerAvailable = true
  } else {
    _tunerAvailable = false
  }
  return _tunerAvailable
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('live-streaming AC', () => {
  // -------------------------------------------------------------------------
  // AC#1: 30 seconds of uninterrupted playback
  // Asserts: currentTime monotonically advances; advances ≥ 25s over 30s wall
  // clock; video.played.length > 0; no error event fires.
  // Requires: real tuner (HLS playlist must be delivered by FFmpeg).
  // -------------------------------------------------------------------------
  test('AC#1 plays for 30s without interruption', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#1 requires a hardware tuner — no tuner available in this environment')

    const channelId = await pickFirstChannelId(request)

    await page.goto(`/live/${channelId}`)

    // Track any <video> error event via a window flag
    await page.evaluate(() => {
      const v = document.querySelector('video')
      if (v) {
        v.addEventListener('error', () => {
          ;(window as Record<string, unknown>).__videoError = true
        })
      }
    })

    await waitForPlaying(page, 15_000)

    // Sample currentTime every 2s for 30s, expect monotonic increase
    const samples: number[] = []
    const wallStart = Date.now()
    for (let i = 0; i < 15; i++) {
      samples.push(await getCurrentTime(page))
      await page.waitForTimeout(2_000)
    }
    const wallElapsed = (Date.now() - wallStart) / 1_000 // seconds

    // Every consecutive sample must be >= previous (currentTime never goes back)
    for (let i = 1; i < samples.length; i++) {
      expect(
        samples[i],
        `currentTime must not decrease (sample ${i - 1}→${i}: ${samples[i - 1]}→${samples[i]})`
      ).toBeGreaterThanOrEqual(samples[i - 1] as number)
    }

    // Over ~30s wall clock, currentTime should advance at least 25s
    const ctAdvance = (samples[samples.length - 1] as number) - (samples[0] as number)
    expect(
      ctAdvance,
      `currentTime advanced ${ctAdvance.toFixed(1)}s over ${wallElapsed.toFixed(1)}s wall`
    ).toBeGreaterThanOrEqual(25)

    // video.played confirms the browser actually rendered frames
    const playedLength = await page.evaluate(() => {
      const v = document.querySelector('video')
      return v?.played.length ?? 0
    })
    expect(playedLength, 'video.played must have at least one range').toBeGreaterThan(0)

    // No error event should have fired
    const hadError = await page.evaluate(() => !!(window as Record<string, unknown>).__videoError)
    expect(hadError, 'no video error event should fire during 30s playback').toBe(false)
  })

  // -------------------------------------------------------------------------
  // AC#2: Reacquires the same sessionId within the 15s grace window
  // API-level: start → release → wait 5s → re-acquire → same sessionId.
  // This test verifies the idle timer cancellation logic in stream-manager.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#2 reacquires same sessionId within 15s grace', async ({ request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#2 requires a hardware tuner — cannot start session without one')

    const channelId = await pickFirstChannelId(request)

    const first = await startLiveSession(request, channelId, 'avc', 'mid')
    expect(first, 'first acquire must succeed').not.toBeNull()
    const firstId = first!.sessionId

    // Release (decrements viewerCount to 0, starts 15s idle timer)
    await releaseSession(request, firstId)

    // Wait 5s — well within the 15s grace window
    await new Promise((r) => setTimeout(r, 5_000))

    const second = await startLiveSession(request, channelId, 'avc', 'mid')
    expect(second, 'second acquire must succeed').not.toBeNull()

    expect(second!.sessionId, 'reacquire within grace window must return the same sessionId').toBe(firstId)

    // Cleanup
    await releaseSession(request, second!.sessionId)
  })

  // -------------------------------------------------------------------------
  // AC#3: Single tuner for same channel/codec/quality across 2 parallel acquires
  // Two concurrent POST requests for the same (channelId, codec, quality) must
  // share a session (same sessionId) and viewerCount must reach 2.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#3 single tuner for same channel/codec/quality across 2 acquires', async ({ request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#3 requires a hardware tuner — cannot start session without one')

    const channelId = await pickFirstChannelId(request)

    // Acquire both in parallel
    const [first, second] = await Promise.all([
      startLiveSession(request, channelId, 'avc', 'mid'),
      startLiveSession(request, channelId, 'avc', 'mid')
    ])

    expect(first, 'first acquire must succeed').not.toBeNull()
    expect(second, 'second acquire must succeed').not.toBeNull()

    expect(first!.sessionId, 'parallel acquires for same key must share a sessionId').toBe(second!.sessionId)

    // Verify viewerCount = 2 via SSE info
    const info = await fetchStreamInfoOnce(request, first!.sessionId)
    expect(info, 'SSE /info must respond for the shared session').not.toBeNull()
    expect(info!.viewerCount, 'viewerCount must be 2 after two parallel acquires').toBe(2)

    // Cleanup
    await releaseSession(request, first!.sessionId)
    await releaseSession(request, second!.sessionId)
  })

  // -------------------------------------------------------------------------
  // AC#4: Page autoplays muted within 3s
  // Asserts: within 3s of page open, video.paused === false AND video.muted === true.
  // Requires: real tuner (the video element is only mounted after stream.status='ready').
  // -------------------------------------------------------------------------
  test('AC#4 autoplays muted on page open', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#4 requires a hardware tuner — video element is not mounted without a stream')

    const channelId = await pickFirstChannelId(request)
    await page.goto(`/live/${channelId}`)

    // Wait up to 3s for both conditions to be true simultaneously
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return !!v && !v.paused && v.muted
      },
      { timeout: 3_000 }
    )

    expect(await getVideoMuted(page), 'video must be muted on autoplay').toBe(true)
    const paused = await page.evaluate(() => document.querySelector('video')?.paused ?? true)
    expect(paused, 'video must not be paused on autoplay').toBe(false)
  })

  // -------------------------------------------------------------------------
  // AC#5: Resumes within 15s grace on reload
  // Navigate, wait for playing, capture sessionId from sidebar,
  // reload, wait for playing again, assert sessionId is unchanged.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#5 resumes within 15s grace on reload', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#5 requires a hardware tuner — no stream to resume')

    const channelId = await pickFirstChannelId(request)
    await page.goto(`/live/${channelId}`)
    await waitForPlaying(page, 15_000)

    // Capture sessionId exposed in sidebar (short hash format: 8 hex chars + "…")
    const shortIdBefore = await page
      .getByRole('complementary', { name: '診断情報パネル' })
      .locator('text=/^[a-f0-9]{8}…$/')
      .first()
      .textContent({ timeout: 3_000 })
      .catch(() => null)

    expect(shortIdBefore, 'sessionId must be visible in sidebar before reload').not.toBeNull()

    // Reload — the client unmounts, sends DELETE, then immediately re-acquires
    // The idle timer (15s) must be cancelled by the fresh acquire
    await page.reload()
    await waitForPlaying(page, 10_000)

    const shortIdAfter = await page
      .getByRole('complementary', { name: '診断情報パネル' })
      .locator('text=/^[a-f0-9]{8}…$/')
      .first()
      .textContent({ timeout: 5_000 })
      .catch(() => null)

    expect(shortIdAfter, 'sessionId must be visible in sidebar after reload').not.toBeNull()
    expect(shortIdAfter, 'sessionId must be the same after reload within grace window').toBe(shortIdBefore)
  })

  // -------------------------------------------------------------------------
  // AC#6: Two tabs on same channel → viewerCount = 2
  // Open two browser contexts on the same /live/<channelId>, assert that the
  // SSE info endpoint reports viewerCount = 2 (single tuner shared).
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#6 two tabs same channel → viewerCount=2', async ({ browser, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#6 requires a hardware tuner')

    const channelId = await pickFirstChannelId(request)

    const ctx1 = await browser.newContext({ baseURL: 'http://localhost:5173' })
    const ctx2 = await browser.newContext({ baseURL: 'http://localhost:5173' })
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    try {
      await Promise.all([page1.goto(`/live/${channelId}`), page2.goto(`/live/${channelId}`)])

      await Promise.all([waitForPlaying(page1, 15_000), waitForPlaying(page2, 15_000)])

      // Both pages must show the same short sessionId in the sidebar
      const sid1 = await page1
        .getByRole('complementary', { name: '診断情報パネル' })
        .locator('text=/^[a-f0-9]{8}…$/')
        .first()
        .textContent({ timeout: 3_000 })
        .catch(() => null)

      const sid2 = await page2
        .getByRole('complementary', { name: '診断情報パネル' })
        .locator('text=/^[a-f0-9]{8}…$/')
        .first()
        .textContent({ timeout: 3_000 })
        .catch(() => null)

      expect(sid1, 'tab 1 must show a sessionId').not.toBeNull()
      expect(sid2, 'tab 2 must show a sessionId').not.toBeNull()
      expect(sid1, 'both tabs must share the same session').toBe(sid2)

      // Also verify via SSE API — extract full sessionId from the shortId
      // (We cannot reconstruct the full UUID from the short 8-char prefix, so
      //  we use the SSE endpoint of the first session as discovered via API)
      const session = await startLiveSession(request, channelId, 'avc', 'mid')
      if (session) {
        const info = await fetchStreamInfoOnce(request, session.sessionId)
        // viewer count should be 3 (page1 + page2 + our probe) or 2 if probe reuses
        expect(info?.viewerCount, 'viewerCount must be >= 2 with two pages open').toBeGreaterThanOrEqual(2)
        await releaseSession(request, session.sessionId)
      }

      // Sidebar viewers value on page1 should show at least 2
      const viewersText = await page1
        .getByRole('complementary', { name: '診断情報パネル' })
        .locator('.font-mono.tabular-nums')
        .filter({ hasText: /^[2-9]$|^[1-9]\d+$/ })
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => null)
      expect(viewersText, 'sidebar viewers row must reflect 2+ viewers').not.toBeNull()
    } finally {
      await ctx1.close()
      await ctx2.close()
    }
  })

  // -------------------------------------------------------------------------
  // AC#7: Two tabs on different channels → two distinct sessions
  // Uses API-level start (no real tuner required for the session-key logic test),
  // but will fail with 503 when there's no tuner.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#7 two tabs different channels → two distinct sessions', async ({ browser, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#7 requires a hardware tuner')

    const [ch1, ch2] = await pickTwoChannelIds(request)

    const [s1, s2] = await Promise.all([
      startLiveSession(request, ch1, 'avc', 'mid'),
      startLiveSession(request, ch2, 'avc', 'mid')
    ])

    expect(s1, 'session for channel 1 must be acquired').not.toBeNull()
    expect(s2, 'session for channel 2 must be acquired').not.toBeNull()

    expect(s1!.sessionId, 'different channels must produce distinct sessionIds').not.toBe(s2!.sessionId)

    await Promise.all([releaseSession(request, s1!.sessionId), releaseSession(request, s2!.sessionId)])
  })

  // -------------------------------------------------------------------------
  // AC#8: AVC SW / AVC HW / HEVC SW / HEVC HW codec matrix
  // SW cells (hwAccel=none) run always.
  // HW cells run only when HW_ACCEL_TYPE === 'nvenc'.
  // Requires: real tuner + appropriate hardware for HW cells.
  // -------------------------------------------------------------------------
  const CODEC_MATRIX: Array<{ codec: 'avc' | 'hevc'; hwAccel: string; skipIf: boolean }> = [
    { codec: 'avc', hwAccel: 'none', skipIf: false },
    { codec: 'hevc', hwAccel: 'none', skipIf: false },
    { codec: 'avc', hwAccel: 'nvenc', skipIf: process.env.HW_ACCEL_TYPE !== 'nvenc' },
    { codec: 'hevc', hwAccel: 'nvenc', skipIf: process.env.HW_ACCEL_TYPE !== 'nvenc' }
  ]

  for (const { codec, hwAccel, skipIf } of CODEC_MATRIX) {
    test(`AC#8 plays with codec=${codec} hwAccel=${hwAccel}`, async ({ page, request }) => {
      test.skip(skipIf, `AC#8 hwAccel=${hwAccel} requires HW_ACCEL_TYPE=nvenc`)

      const tuner = await isTunerAvailable(request)
      test.fixme(!tuner, `AC#8 codec=${codec} hwAccel=${hwAccel} requires a hardware tuner`)

      const channelId = await pickFirstChannelId(request)

      // Navigate to live page — codec defaults to AVC; for HEVC we switch via picker
      await page.goto(`/live/${channelId}`)

      if (codec === 'hevc') {
        const picker = page.getByRole('combobox', { name: 'コーデック' })
        await expect(picker).toBeVisible({ timeout: 5_000 })
        await picker.selectOption('hevc')
      }

      // Wait for the stream status chip to show 'OK' (stream.status='ready')
      await expect(page.getByRole('status').filter({ hasText: 'OK' }).first()).toBeVisible({ timeout: 15_000 })

      await waitForPlaying(page, 15_000)

      // Assert SSE info codec matches
      const sidebarCodec = await page
        .getByRole('complementary', { name: '診断情報パネル' })
        .locator(`.font-mono:has-text("${codec.toUpperCase()}")`)
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => null)

      expect(sidebarCodec, `sidebar codec must show ${codec.toUpperCase()}`).not.toBeNull()
    })
  }

  // -------------------------------------------------------------------------
  // AC#9: Sidebar reflects SSE stream info within 3s
  // After stream is playing, within 3s the sidebar must show:
  //   codec   → "AVC" (not "—")
  //   resolution → matches /^\d+x\d+$/
  //   bitrate → matches /^\d/  (any number, possibly "0 Mbps" until FFmpeg settles)
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#9 sidebar reflects SSE within 3s', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#9 requires a hardware tuner — SSE needs a live session')

    const channelId = await pickFirstChannelId(request)
    await page.goto(`/live/${channelId}`)

    // Wait until stream is ready
    await expect(page.getByRole('status').filter({ hasText: 'OK' }).first()).toBeVisible({ timeout: 15_000 })

    const sidebar = page.getByRole('complementary', { name: '診断情報パネル' })

    // codec row: changes from "—" to "AVC"
    await expect(async () => {
      const codecVal = await sidebar
        .locator('.font-mono')
        .filter({ hasText: /^AVC$|^HEVC$/ })
        .first()
        .textContent()
      expect(codecVal).toMatch(/^AVC$|^HEVC$/)
    }).toPass({ timeout: 3_000 })

    // resolution row: must match "NNNxNNN"
    await expect(async () => {
      // Find all mono text values, look for one that matches resolution pattern
      const texts = await sidebar.locator('.font-mono.tabular-nums').allTextContents()
      const hasResolution = texts.some((t) => /^\d+x\d+$/.test(t.trim()))
      expect(hasResolution, `Expected a resolution value matching /^\\d+x\\d+$/ in: ${JSON.stringify(texts)}`).toBe(
        true
      )
    }).toPass({ timeout: 3_000 })

    // bitrate row: must start with a digit followed by text (e.g. "3.0 Mbps" or "0.0 Mbps")
    await expect(async () => {
      const texts = await sidebar.locator('.font-mono.tabular-nums').allTextContents()
      const hasBitrate = texts.some((t) => /^\d+\.\d+\s*Mbps$/.test(t.trim()))
      expect(hasBitrate, `Expected a bitrate value matching /^\\d+.\\d+ Mbps$/ in: ${JSON.stringify(texts)}`).toBe(true)
    }).toPass({ timeout: 3_000 })
  })

  // -------------------------------------------------------------------------
  // AC#10: ABR placeholder (fixme)
  // This is intentionally deferred. The test documents the TODO item.
  // -------------------------------------------------------------------------
  test.fixme('AC#10 ABR TODO placeholder', async () => {
    // TODO(phase-2-abr): When droppedFrames exceeds a threshold, FFmpeg should
    // be restarted with a lower quality preset automatically.
    // This will be verified in Phase 6.
  })

  // -------------------------------------------------------------------------
  // AC#11: Different codecs on same channel → distinct sessions
  // AVC/mid and HEVC/mid for the same channelId must produce different sessionIds,
  // confirming the session key includes codec.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#11 different codecs same channel → distinct sessions', async ({ request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#11 requires a hardware tuner')

    const channelId = await pickFirstChannelId(request)

    const [avcSession, hevcSession] = await Promise.all([
      startLiveSession(request, channelId, 'avc', 'mid'),
      startLiveSession(request, channelId, 'hevc', 'mid')
    ])

    expect(avcSession, 'AVC session must be acquired').not.toBeNull()
    expect(hevcSession, 'HEVC session must be acquired').not.toBeNull()

    expect(avcSession!.sessionId, 'AVC and HEVC sessions for the same channel must have distinct sessionIds').not.toBe(
      hevcSession!.sessionId
    )

    // Verify each session's SSE reports the correct codec
    const [avcInfo, hevcInfo] = await Promise.all([
      fetchStreamInfoOnce(request, avcSession!.sessionId),
      fetchStreamInfoOnce(request, hevcSession!.sessionId)
    ])

    expect(avcInfo?.codec, 'AVC session SSE must report codec=avc').toBe('avc')
    expect(hevcInfo?.codec, 'HEVC session SSE must report codec=hevc').toBe('hevc')

    await Promise.all([releaseSession(request, avcSession!.sessionId), releaseSession(request, hevcSession!.sessionId)])
  })

  // -------------------------------------------------------------------------
  // AC#12: Codec switch mid-stream restarts the stream
  // Navigate to live page (AVC default), wait for playing, open the codec
  // picker and switch to HEVC. Within 6s: SSE codec=hevc, video playing again.
  // The sessionId may change; we only assert that codec changed and video resumed.
  // Requires: real tuner.
  // -------------------------------------------------------------------------
  test('AC#12 codec switch restarts stream', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'AC#12 requires a hardware tuner')

    const channelId = await pickFirstChannelId(request)
    await page.goto(`/live/${channelId}`)

    // Wait for AVC stream to start playing
    await waitForPlaying(page, 15_000)

    // Confirm initial codec is AVC in sidebar
    const sidebar = page.getByRole('complementary', { name: '診断情報パネル' })
    await expect(sidebar.locator('.font-mono').filter({ hasText: 'AVC' }).first()).toBeVisible({
      timeout: 5_000
    })

    // Switch codec to HEVC via the PlayerControls codec picker
    const picker = page.getByRole('combobox', { name: 'コーデック' })
    await expect(picker).toBeVisible({ timeout: 5_000 })
    await picker.selectOption('hevc')

    // Within 6s: stream must re-acquire and sidebar must show HEVC
    await expect(sidebar.locator('.font-mono').filter({ hasText: 'HEVC' }).first()).toBeVisible({
      timeout: 6_000
    })

    // Video must be playing again (codec switch involves a brief black screen)
    await waitForPlaying(page, 10_000)
  })

  // -------------------------------------------------------------------------
  // Additional: API contract tests that DO NOT require a real tuner
  // -------------------------------------------------------------------------

  test('channels endpoint returns at least one channel', async ({ request }) => {
    const channelId = await pickFirstChannelId(request)
    expect(channelId).toBeTruthy()
    expect(typeof channelId).toBe('string')
  })

  test('POST /api/streams/live returns 201 or 503 (never 4xx)', async ({ request }) => {
    const channelId = await pickFirstChannelId(request)
    const res = await request.post(`/api/streams/live/${channelId}`, {
      data: { codec: 'avc', quality: 'mid' }
    })
    // 201 = tuner available, 503 = no tuner — both are valid in this environment
    expect([201, 503], `expected 201 or 503, got ${res.status()}`).toContain(res.status())
  })

  test('POST /api/streams/live with invalid codec returns 400', async ({ request }) => {
    const channelId = await pickFirstChannelId(request)
    const res = await request.post(`/api/streams/live/${channelId}`, {
      data: { codec: 'vp9', quality: 'mid' } // VP9 is not in the enum
    })
    expect(res.status(), 'invalid codec must be rejected with 400').toBe(400)
  })

  test('POST /api/streams/live with invalid quality returns 400', async ({ request }) => {
    const channelId = await pickFirstChannelId(request)
    const res = await request.post(`/api/streams/live/${channelId}`, {
      data: { codec: 'avc', quality: 'ultra' } // not in enum
    })
    expect(res.status(), 'invalid quality must be rejected with 400').toBe(400)
  })

  test('DELETE /api/streams/:id with unknown id returns 204 (idempotent)', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await request.delete(`/api/streams/${fakeId}`)
    // release() silently ignores unknown sessionIds → 204
    expect(res.status(), 'DELETE with unknown sessionId must be 204').toBe(204)
  })

  test('GET /api/streams/:id/info with unknown id returns 404', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await request.get(`/api/streams/${fakeId}/info`)
    expect(res.status(), 'GET /info with unknown sessionId must return 404').toBe(404)
  })

  test('/live/:channelId page renders without 500 error', async ({ page }) => {
    // This test works even without a tuner: the page shows INIT spinner
    await page.goto(`/live/3272102056`)
    await page.waitForLoadState('domcontentloaded')

    // No unhandled JS error should surface
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // The page structure must be present
    await expect(page.getByRole('complementary', { name: '診断情報パネル' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'チャンネルリストへ戻る' })).toBeVisible()

    // Codec picker must be present in PlayerControls
    await expect(page.getByRole('combobox', { name: 'コーデック' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: '画質' })).toBeVisible()

    // Give time for any async errors to surface
    await page.waitForTimeout(1_000)
    expect(errors, 'no unhandled JS errors on the live page').toHaveLength(0)
  })

  test('/live/:channelId page shows INIT or FATAL status chip while stream starts', async ({ page }) => {
    await page.goto(`/live/3272102056`)
    await page.waitForLoadState('domcontentloaded')

    // The live page header is a <header> element (implicit `banner` role only at
    // the top-level document, but here it is nested inside the shell layout, so
    // it does NOT carry role="banner"). Target it by its child content instead.
    // The status chip (INIT → FATAL when no tuner, or INIT → LIVE when tuner is
    // present) is rendered in the live page app-bar alongside the channel name.
    // Wait up to 6s to account for the async stream start attempt.
    await expect(
      page
        .locator('[data-testid="live-status-chip"], .font-mono')
        .filter({ hasText: /^INIT$|^FATAL$|^LIVE$/ })
        .first()
    ).toBeVisible({ timeout: 6_000 })
  })
})
