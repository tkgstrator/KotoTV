import { expect, test } from '@playwright/test'

/**
 * Live playback end-to-end.
 *
 * The backend streams a lavfi dummy source (see stream-manager.ts), so there
 * is no Mirakc dependency. The test navigates to /live/<channelId>, waits
 * for hls.js to wire the MediaSource, and confirms the video element is
 * actually advancing (currentTime > 0) — proving the whole pipe works:
 *
 *     POST /api/streams/live → ffmpeg spawns → playlist.m3u8 written
 *   → GET  /api/streams/:sessionId/playlist.m3u8
 *   → GET  /api/streams/:sessionId/<segment>
 *   → hls.js → <video> playback
 *
 * ID "1024" is NHK総合 in the Mirakc mock service list — always present in
 * dev mode regardless of whether Mirakc itself is reachable.
 */
test.describe('live playback — dummy HLS source', () => {
  test('video starts playing after navigating to /live/<channelId>', async ({ page, context }) => {
    // Playwright's bundled Chromium ships without proprietary codecs (AVC/HEVC),
    // so the dummy pipe is forced to VP9 (libvpx-vp9 + opus + fmp4 HLS) for this
    // test. Real browsers (Chrome stable, Safari, Firefox) can play all 3 paths.
    await context.addInitScript(() => {
      localStorage.setItem(
        'kototv-playback-prefs',
        JSON.stringify({ quality: 'low', codec: 'vp9', autoplay: true, defaultVolume: 1, lowLatency: true })
      )
    })

    const logs: string[] = []
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
    page.on('pageerror', (err) => logs.push(`[err] ${err.message}`))

    await page.goto('/live/1024')
    await page.waitForLoadState('domcontentloaded')

    const video = page.locator('video').first()
    await expect(video).toBeVisible({ timeout: 15_000 })

    // Give hls.js a beat to attach MediaSource + pull the first segment, then
    // dump browser state. waitForFunction without a useful diagnostic on
    // failure just gives us "timed out".
    try {
      await page.waitForFunction(
        () => {
          const v = document.querySelector('video') as HTMLVideoElement | null
          return v ? v.readyState >= 1 : false
        },
        undefined,
        { timeout: 20_000 }
      )
    } catch (e) {
      const diag = await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null
        return v
          ? {
              src: v.src,
              networkState: v.networkState,
              readyState: v.readyState,
              errorCode: v.error?.code ?? null,
              errorMsg: v.error?.message ?? null
            }
          : null
      })
      // biome-ignore lint/suspicious/noConsole: debug
      console.error('video diagnostic on timeout:', diag)
      // biome-ignore lint/suspicious/noConsole: debug
      console.error('captured page logs:\n', logs.join('\n'))
      throw e
    }

    // Wait for actual frame decode — currentTime must advance.
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video') as HTMLVideoElement | null
        return v ? v.currentTime > 0.1 : false
      },
      undefined,
      { timeout: 20_000 }
    )

    const metrics = await video.evaluate((el) => {
      const v = el as HTMLVideoElement
      return {
        currentTime: v.currentTime,
        readyState: v.readyState,
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight
      }
    })

    // biome-ignore lint/suspicious/noConsole: debug
    console.log('browser logs:\n', logs.join('\n'))

    expect(metrics.currentTime).toBeGreaterThan(0)
    expect(metrics.readyState).toBeGreaterThanOrEqual(1)
    // lavfi testsrc2 renders at the requested resolution; for "auto" (720p)
    // we expect 1280×720. Don't pin exact values (quality pref may change
    // in the client); just confirm the stream surfaced a resolution.
    expect(metrics.videoWidth).toBeGreaterThan(0)
    expect(metrics.videoHeight).toBeGreaterThan(0)
  })

  test('quality pref is forwarded to the live stream POST', async ({ page, context }) => {
    // Codec prefs currently clamp to AVC regardless of user pick (see
    // resolveLiveCodec), so assert only the quality portion — that's the
    // part the client actually honors end-to-end right now.
    await context.addInitScript(() => {
      localStorage.setItem(
        'kototv-playback-prefs',
        JSON.stringify({ quality: 'low', codec: 'auto', autoplay: true, defaultVolume: 1, lowLatency: true })
      )
    })

    const [postReq] = await Promise.all([
      page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/streams/live/1024'), {
        timeout: 20_000
      }),
      page.goto('/live/1024')
    ])

    expect(postReq.url()).toContain('quality=low')
    // Playwright Chromium has no licensed AVC decoder so resolveLiveCodec
    // falls back to VP9. Real Chrome/Safari/Firefox pick AVC. Either is a
    // browser-supported codec, which is all the test needs to validate.
    expect(postReq.url()).toMatch(/codec=(avc|hevc|vp9)/)
  })
})
