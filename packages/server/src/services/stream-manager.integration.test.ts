/**
 * End-to-end test for the stream-manager + dummy transcoder. Spawns a real
 * ffmpeg with lavfi inputs, waits for the HLS playlist to show up, reads
 * segments off disk, and tears everything down.
 *
 * All work happens inside a per-test HLS_DIR under tmpdir so the suite can
 * run in parallel with a live dev server.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Point HLS_DIR at a disposable scratch dir before the config module loads.
const TEST_HLS_DIR = join(tmpdir(), 'kototv-stream-mgr-itest')
process.env.HLS_DIR = TEST_HLS_DIR
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

const { acquireLive, release, getSessionDir, stopAllSessions } = await import('./stream-manager')

beforeAll(() => {
  rmSync(TEST_HLS_DIR, { recursive: true, force: true })
})

afterAll(async () => {
  await stopAllSessions()
  rmSync(TEST_HLS_DIR, { recursive: true, force: true })
})

describe('acquireLive — dummy lavfi source', () => {
  test('produces an HLS playlist on disk within 10s', async () => {
    const { sessionId, playlistUrl } = await acquireLive({
      channelId: 'test-avc',
      quality: 'low',
      codec: 'avc'
    })
    expect(sessionId).toMatch(/^[0-9a-f]{8}-/)
    expect(playlistUrl).toBe(`/api/streams/${sessionId}/playlist.m3u8`)

    const dir = getSessionDir(sessionId)
    expect(dir).not.toBeNull()
    const playlistPath = join(dir as string, 'playlist.m3u8')
    expect(existsSync(playlistPath)).toBe(true)
    const playlist = readFileSync(playlistPath, 'utf-8')
    expect(playlist).toContain('#EXTM3U')

    // The first segment should be on its way (written within 2-3s of start).
    // Give ffmpeg a beat so we're not racing the initial segment write.
    await new Promise((r) => setTimeout(r, 2500))
    expect(readFileSync(playlistPath, 'utf-8')).toContain('.ts')

    release(sessionId)
  }, 30_000)

  test('second acquire with identical key shares the session (viewer count)', async () => {
    const a = await acquireLive({ channelId: 'test-share', quality: 'low', codec: 'avc' })
    const b = await acquireLive({ channelId: 'test-share', quality: 'low', codec: 'avc' })
    expect(b.sessionId).toBe(a.sessionId) // same session, not a new spawn

    release(a.sessionId)
    release(b.sessionId)
  }, 30_000)

  test('different codec on same channel opens a distinct session', async () => {
    const a = await acquireLive({ channelId: 'test-codec-split', quality: 'low', codec: 'avc' })
    const b = await acquireLive({ channelId: 'test-codec-split', quality: 'low', codec: 'hevc' })
    expect(b.sessionId).not.toBe(a.sessionId)

    release(a.sessionId)
    release(b.sessionId)
  }, 30_000)
})
