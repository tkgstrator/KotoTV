/**
 * Shared utilities for live-streaming E2E tests.
 *
 * All helpers that make API calls use the APIRequestContext from Playwright
 * rather than the page so they work headlessly without a browser tab.
 * The baseURL is picked up from playwright.config.ts (http://localhost:5173),
 * which proxies /api/* to the backend server at http://localhost:11575.
 */

import type { APIRequestContext, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamInfo {
  codec: 'avc' | 'hevc'
  resolution: string // e.g. "1280x720"
  bitrate: number // kbps
  fps: number
  hwAccel: 'none' | 'nvenc' | 'qsv' | 'vaapi'
  viewerCount: number
  droppedFrames: number
  bufferSec: number
}

export interface StartStreamResponse {
  sessionId: string
  playlistUrl: string
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * GET /api/channels and return the first channel id.
 * Throws if the list is empty.
 */
export async function pickFirstChannelId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/channels')
  if (!res.ok()) throw new Error(`GET /api/channels failed: ${res.status()}`)
  const body = await res.json()
  const id: string | undefined = body.channels?.[0]?.id
  if (!id) throw new Error('No channels returned by /api/channels')
  return String(id)
}

/**
 * GET /api/channels and return the first two channel ids.
 * Throws if fewer than two channels are available.
 */
export async function pickTwoChannelIds(request: APIRequestContext): Promise<[string, string]> {
  const res = await request.get('/api/channels')
  if (!res.ok()) throw new Error(`GET /api/channels failed: ${res.status()}`)
  const body = await res.json()
  if ((body.channels?.length ?? 0) < 2) throw new Error('Need at least 2 channels')
  return [String(body.channels[0].id), String(body.channels[1].id)]
}

/**
 * POST /api/streams/live/:channelId  →  { sessionId, playlistUrl }
 *
 * Returns null (instead of throwing) when the server returns 503, which
 * happens in devcontainer environments where Mirakc has no real tuner.
 * Tests that require an actual stream session must check for null and call
 * test.skip() or assert on the 503 itself.
 */
export async function startLiveSession(
  request: APIRequestContext,
  channelId: string,
  codec: 'avc' | 'hevc',
  quality: 'low' | 'mid' | 'high'
): Promise<StartStreamResponse | null> {
  const res = await request.post(`/api/streams/live/${channelId}`, {
    data: { codec, quality },
    timeout: 60_000 // matches server-side waitForPlaylist + generous margin
  })
  if (res.status() === 503) return null
  if (!res.ok()) throw new Error(`POST /api/streams/live/${channelId} failed: ${res.status()}`)
  return res.json() as Promise<StartStreamResponse>
}

/**
 * DELETE /api/streams/:sessionId  →  204
 */
export async function releaseSession(request: APIRequestContext, sessionId: string): Promise<void> {
  await request.delete(`/api/streams/${sessionId}`)
}

/**
 * Consume the SSE endpoint for a session and return the first StreamInfo frame.
 *
 * Implementation: We fetch the endpoint with a short timeout and parse the
 * raw text because Playwright's APIRequestContext does not support streaming.
 * The body of a live SSE response begins immediately with a `data: {...}` line
 * so the first chunk is enough.
 *
 * Returns null if the session does not exist (404) or times out.
 */
export async function fetchStreamInfoOnce(
  request: APIRequestContext,
  sessionId: string,
  timeoutMs = 4000
): Promise<StreamInfo | null> {
  // Use a plain fetch with AbortSignal so we can interrupt the long-lived SSE
  // response after reading the first frame.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`http://localhost:5173/api/streams/${sessionId}/info`, {
      signal: controller.signal
    })
    if (!res.ok) return null

    // Read chunks until we find a complete SSE data line
    const reader = res.body?.getReader()
    if (!reader) return null

    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += new TextDecoder().decode(value)
      // SSE frame format: "data: {...}\n\n"
      const match = buffer.match(/data:\s*(\{[^\n]+\})/)
      if (match) {
        reader.cancel().catch(() => {})
        return JSON.parse(match[1]) as StreamInfo
      }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Page / video helpers
// ---------------------------------------------------------------------------

/**
 * Wait until the <video> element is actively playing.
 *
 * For live HLS, hls.js may hold `currentTime` at 0 briefly while seeking to
 * the live edge — check buffered ranges as a secondary readiness signal so the
 * helper doesn't hang on live streams.
 */
export function waitForPlaying(page: Page, timeoutMs = 15_000): Promise<void> {
  return page.waitForFunction(
    () => {
      const v = document.querySelector('video')
      if (!v || v.paused || v.readyState < 3) return false
      const hasBuffered = v.buffered.length > 0 && v.buffered.end(v.buffered.length - 1) > 0
      return v.currentTime > 0 || hasBuffered
    },
    { timeout: timeoutMs }
  )
}

/**
 * Return the current video.currentTime, or 0 if no video element exists.
 */
export async function getCurrentTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const v = document.querySelector('video')
    return v?.currentTime ?? 0
  })
}

/**
 * Return video.muted state. Defaults to true if no video element exists.
 */
export async function getVideoMuted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const v = document.querySelector('video')
    return v?.muted ?? true
  })
}

/**
 * Return the number of seconds buffered ahead of currentTime.
 * Returns 0 if no video or no buffered ranges.
 */
export async function getVideoBuffered(page: Page): Promise<number> {
  return page.evaluate(() => {
    const v = document.querySelector('video')
    if (!v || v.buffered.length === 0) return 0
    return v.buffered.end(v.buffered.length - 1) - v.currentTime
  })
}

/**
 * Read the session_id from the DiagnosticSidebar (shows first 8 chars + "…").
 * Returns null if the sidebar shows "—" (no session yet).
 */
export async function getSidebarSessionId(page: Page): Promise<string | null> {
  // The sidebar renders shortId = `${sessionId.slice(0, 8)}…` or "—"
  const text = await page
    .getByRole('complementary', { name: '診断情報パネル' })
    .locator('text=/^[a-f0-9]{8}…$/')
    .first()
    .textContent({ timeout: 5000 })
    .catch(() => null)
  return text ?? null
}
