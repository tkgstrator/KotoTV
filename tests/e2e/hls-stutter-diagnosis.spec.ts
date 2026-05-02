/**
 * hls-stutter-diagnosis.spec.ts
 *
 * Diagnose the "plays for a few seconds, briefly freezes, then resumes normally"
 * pattern in live HLS playback. Monitors video element events and buffer state
 * during the first 30 seconds of playback to identify the root cause.
 *
 * Run:
 *   CLIENT_URL=http://localhost:16576 bunx playwright test --project=desktop-chromium tests/e2e/hls-stutter-diagnosis.spec.ts
 */

import { expect, test } from '@playwright/test'
import { pickFirstChannelId, releaseSession, startLiveSession } from './helpers/live-stream'

let _tunerAvailable: boolean | undefined

async function isTunerAvailable(request: Parameters<typeof startLiveSession>[0]): Promise<boolean> {
  if (_tunerAvailable !== undefined) return _tunerAvailable
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

interface VideoEvent {
  type: string
  time: number
  currentTime: number
  readyState: number
  bufferedEnd: number
  bufferedAhead: number
  paused: boolean
  networkState: number
}

test.describe('HLS initial stutter diagnosis', () => {
  test.setTimeout(120_000)

  test('monitor video events and buffer state for 30s', async ({ page, request }) => {
    const tuner = await isTunerAvailable(request)
    test.fixme(!tuner, 'requires a hardware tuner')

    const channelId = await pickFirstChannelId(request)

    // Intercept video element creation to capture ALL events from the very start
    await page.addInitScript(() => {
      const w = window as any
      w.__hlsEvents = []
      w.__hlsStartTime = 0

      const origCreateElement = document.createElement.bind(document)
      document.createElement = ((tag: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tag, options)
        if (tag.toLowerCase() === 'video') {
          w.__hlsStartTime = Date.now()
          const v = el as HTMLVideoElement

          const pushEvent = (type: string) => {
            const now = Date.now() - w.__hlsStartTime
            w.__hlsEvents.push({
              type,
              time: now,
              currentTime: v.currentTime,
              readyState: v.readyState,
              bufferedEnd: v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) : 0,
              bufferedAhead: v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 0,
              paused: v.paused,
              networkState: v.networkState
            })
          }

          const events = [
            'loadstart',
            'loadedmetadata',
            'loadeddata',
            'canplay',
            'canplaythrough',
            'playing',
            'waiting',
            'stalled',
            'pause',
            'play',
            'seeking',
            'seeked',
            'emptied',
            'suspend',
            'error',
            'timeupdate',
            'progress'
          ]
          for (const evt of events) {
            v.addEventListener(evt, () => pushEvent(evt))
          }

          let polls = 0
          const pollId = setInterval(() => {
            polls++
            if (polls > 200) {
              clearInterval(pollId)
              return
            }
            pushEvent('poll')
          }, 200)
        }
        return el
      }) as typeof document.createElement
    })

    await page.goto(`/live/${channelId}`)

    // Wait for video to start playing
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return v && !v.paused && v.currentTime > 0
      },
      { timeout: 60_000 }
    )

    console.log('--- Video started playing, monitoring for 30s ---')

    // Wait 30 seconds of playback
    await page.waitForTimeout(30_000)

    // Collect all events
    const events: VideoEvent[] = await page.evaluate(() => (window as any).__hlsEvents ?? [])

    // --- Analysis ---

    // 1. Find all 'waiting' events (buffer underrun / stall)
    const waitingEvents = events.filter((e) => e.type === 'waiting')
    console.log(`\n=== WAITING events (buffer underrun): ${waitingEvents.length} ===`)
    for (const e of waitingEvents) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | currentTime=${e.currentTime.toFixed(2)} | readyState=${e.readyState} | bufferedAhead=${e.bufferedAhead.toFixed(2)}s | paused=${e.paused}`
      )
    }

    // 2. Find all 'stalled' events
    const stalledEvents = events.filter((e) => e.type === 'stalled')
    console.log(`\n=== STALLED events (no data for ~3s): ${stalledEvents.length} ===`)
    for (const e of stalledEvents) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | currentTime=${e.currentTime.toFixed(2)} | bufferedAhead=${e.bufferedAhead.toFixed(2)}s`
      )
    }

    // 3. Find 'pause' events that aren't user-initiated
    const pauseEvents = events.filter((e) => e.type === 'pause')
    console.log(`\n=== PAUSE events: ${pauseEvents.length} ===`)
    for (const e of pauseEvents) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | currentTime=${e.currentTime.toFixed(2)} | readyState=${e.readyState}`
      )
    }

    // 4. Find periods where readyState dropped below HAVE_FUTURE_DATA (3)
    const pollEvents = events.filter((e) => e.type === 'poll')
    const lowReadyStates = pollEvents.filter((e) => e.readyState < 3 && e.currentTime > 0)
    console.log(`\n=== Low readyState periods (< HAVE_FUTURE_DATA): ${lowReadyStates.length} samples ===`)
    for (const e of lowReadyStates.slice(0, 20)) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | readyState=${e.readyState} | currentTime=${e.currentTime.toFixed(2)} | bufferedAhead=${e.bufferedAhead.toFixed(2)}s`
      )
    }

    // 5. Find periods where bufferedAhead dropped to near-zero during playback
    const bufferDrops = pollEvents.filter((e) => e.bufferedAhead < 0.5 && e.currentTime > 0 && !e.paused)
    console.log(`\n=== Buffer drops (< 0.5s ahead while playing): ${bufferDrops.length} samples ===`)
    for (const e of bufferDrops.slice(0, 20)) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | bufferedAhead=${e.bufferedAhead.toFixed(2)}s | currentTime=${e.currentTime.toFixed(2)}`
      )
    }

    // 6. Seeking events (hls.js live sync adjustments)
    const seekingEvents = events.filter((e) => e.type === 'seeking')
    const seekedEvents = events.filter((e) => e.type === 'seeked')
    console.log(`\n=== SEEKING events: ${seekingEvents.length} ===`)
    for (const e of seekingEvents) {
      console.log(
        `  t=${(e.time / 1000).toFixed(1)}s | currentTime=${e.currentTime.toFixed(2)} | bufferedAhead=${e.bufferedAhead.toFixed(2)}s`
      )
    }
    console.log(`=== SEEKED events: ${seekedEvents.length} ===`)

    // 7. Timeline of key events (exclude noisy poll/suspend/timeupdate/progress)
    const keyEvents = events.filter(
      (e) => e.type !== 'poll' && e.type !== 'suspend' && e.type !== 'timeupdate' && e.type !== 'progress'
    )
    console.log(`\n=== Key event timeline ===`)
    for (const e of keyEvents) {
      console.log(
        `  ${(e.time / 1000).toFixed(1).padStart(6)}s  ${e.type.padEnd(16)} ct=${e.currentTime.toFixed(2).padStart(8)}  rs=${e.readyState}  buf=${e.bufferedAhead.toFixed(2).padStart(6)}s  ${e.paused ? 'PAUSED' : 'playing'}`
      )
    }

    // 8. Buffer health over time (sampled every 2s)
    console.log(`\n=== Buffer health timeline (every 2s) ===`)
    const sampledPolls = pollEvents.filter((_, i) => i % 10 === 0)
    for (const e of sampledPolls) {
      const bar = '█'.repeat(Math.min(Math.round(e.bufferedAhead * 2), 40))
      console.log(
        `  ${(e.time / 1000).toFixed(1).padStart(6)}s  buf=${e.bufferedAhead.toFixed(2).padStart(6)}s  ${bar}`
      )
    }

    // --- Summary / Verdict ---
    console.log('\n=== DIAGNOSIS SUMMARY ===')

    const hasWaitingStutter = waitingEvents.some((e) => e.time > 2000 && e.time < 15000)
    const hasSeekJump = seekingEvents.some((e) => e.time > 2000 && e.time < 15000)
    const hasBufferDrop = bufferDrops.some((e) => e.time > 2000 && e.time < 15000)

    if (hasWaitingStutter) {
      console.log('FINDING: "waiting" event fired during 2-15s window — buffer underrun caused the stutter.')
      console.log('LIKELY CAUSE: hls.js ran out of buffered data while catching up to the live edge.')
      console.log('FIX: Configure hls.js with liveSyncDuration/maxBufferLength to prevent this.')
    }

    if (hasSeekJump) {
      console.log('FINDING: "seeking" event during 2-15s window — hls.js performed a live-edge seek.')
      console.log('LIKELY CAUSE: hls.js liveSyncDurationCount triggered a jump to the live edge.')
      console.log('FIX: Tune liveSyncDuration to match segment timing, or reduce segment duration.')
    }

    if (hasBufferDrop) {
      console.log('FINDING: Buffer dropped below 0.5s during 2-15s window.')
      console.log('LIKELY CAUSE: Initial segments loaded faster than FFmpeg produces new ones.')
    }

    if (!hasWaitingStutter && !hasSeekJump && !hasBufferDrop) {
      console.log('No stutter detected in this run. The issue may be intermittent.')
    }

    // Soft assertions — the test passes either way but warns
    if (waitingEvents.length > 0) {
      console.log(`\nWARNING: ${waitingEvents.length} "waiting" event(s) detected — each one is a visible freeze.`)
    }

    // Hard assertion: playback must have advanced during 30s
    const firstPoll = pollEvents[0]
    const lastPoll = pollEvents[pollEvents.length - 1]
    if (firstPoll && lastPoll) {
      const advance = lastPoll.currentTime - firstPoll.currentTime
      expect(advance, 'currentTime must advance during 30s of monitoring').toBeGreaterThan(15)
    }
  })
})
