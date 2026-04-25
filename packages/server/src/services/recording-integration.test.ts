import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { addSeconds } from 'date-fns'
import { app } from '../app'
import { env } from '../lib/config'
import { prisma } from '../lib/prisma'
import { loadAndScheduleAll, stopRecordingManager } from './recording-manager'

const TEST_PREFIX = '__test_atx_rec__'
const RECORDING_DURATION_SEC = 10
const ATX_CHANNEL_ID = '700333'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ChannelResponse = {
  channels: Array<{
    id: string
    name: string
    type: string
    currentProgram: { id: string; title: string } | null
  }>
}

describe('AT-X 10-second recording → playback → delete', () => {
  let scheduleId: string | null = null
  let recordingId: string | null = null
  let recordingFilePath: string | null = null
  let programId: string

  beforeAll(async () => {
    await mkdir(env.RECORDINGS_DIR, { recursive: true })
    await mkdir(env.HLS_DIR, { recursive: true })
  })

  afterAll(async () => {
    await stopRecordingManager()

    if (recordingFilePath) {
      try {
        await unlink(recordingFilePath)
      } catch {}
      try {
        await unlink(recordingFilePath.replace(/\.mp4$/, '_thumb.jpg'))
      } catch {}
    }
    if (scheduleId) {
      await prisma.recording.deleteMany({ where: { scheduleId } })
      await prisma.recordingSchedule.deleteMany({ where: { id: scheduleId } })
    }
  })

  test('AT-X チャンネル (id=700333) の放送中番組を取得', async () => {
    const res = await app.request('/api/channels?type=CS')
    expect(res.status).toBe(200)

    const body: ChannelResponse = await res.json()
    const atx = body.channels.find((ch) => ch.id === ATX_CHANNEL_ID)
    expect(atx).toBeDefined()
    expect(atx!.currentProgram).not.toBeNull()

    programId = atx!.currentProgram!.id
  })

  test('録画スケジュールを作成し、10秒間録画して完了する', async () => {
    const now = new Date()
    const startAt = addSeconds(now, 3)
    const endAt = addSeconds(startAt, RECORDING_DURATION_SEC)
    const uniqueProgramId = `${programId}-test-${Date.now()}`

    const createRes = await app.request('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: ATX_CHANNEL_ID,
        programId: uniqueProgramId,
        title: `${TEST_PREFIX}AT-X test`,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      })
    })
    if (createRes.status !== 201) {
      const body = await createRes.text()
      throw new Error(`failed to create schedule: ${createRes.status} ${body}`)
    }

    const schedule = await createRes.json()
    scheduleId = schedule.id
    expect(schedule.status).toBe('pending')

    // Directly trigger schedule loading — only picks up OUR schedule (avoids
    // side effects from startRecordingManager's full poll loop).
    await loadAndScheduleAll()

    // Poll DB until the recording completes
    const deadline = Date.now() + 30_000
    let recording: Awaited<ReturnType<typeof prisma.recording.findFirst>> = null

    while (Date.now() < deadline) {
      recording = await prisma.recording.findFirst({
        where: { scheduleId: scheduleId! }
      })
      if (recording?.status === 'completed') break

      const sched = await prisma.recordingSchedule.findUnique({ where: { id: scheduleId! } })
      if (sched?.status === 'failed') {
        throw new Error(`schedule marked as failed: ${sched.failureReason}`)
      }

      await sleep(1_000)
    }

    expect(recording).not.toBeNull()
    expect(recording!.status).toBe('completed')
    expect(recording!.filePath).not.toBeNull()
    expect(recording!.durationSec).toBeGreaterThanOrEqual(8)
    expect(Number(recording!.sizeBytes)).toBeGreaterThan(0)

    recordingId = recording!.id
    recordingFilePath = recording!.filePath
  }, 35_000)

  test('録画ファイルがディスク上に存在し、十分なサイズがある', async () => {
    expect(recordingFilePath).not.toBeNull()

    const info = await stat(recordingFilePath!)
    expect(info.size).toBeGreaterThan(100_000)
  })

  test('録画を HLS ストリームで再生し、セグメントが正しいことを確認', async () => {
    expect(recordingId).not.toBeNull()

    const startRes = await app.request(`/api/streams/recording/${recordingId}`, {
      method: 'POST'
    })
    expect(startRes.status).toBe(201)

    const { sessionId, playlistUrl } = await startRes.json()
    expect(typeof sessionId).toBe('string')
    expect(playlistUrl).toContain('playlist.m3u8')

    // Wait for FFmpeg to transcode enough segments
    await sleep(6_000)

    const playlistRes = await app.request(playlistUrl)
    expect(playlistRes.status).toBe(200)
    expect(playlistRes.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl')

    const playlist = await playlistRes.text()
    expect(playlist).toContain('#EXTM3U')
    expect(playlist).toContain('#EXT-X-TARGETDURATION')

    const segments = playlist.match(/\d{4}\.ts/g)
    expect(segments).not.toBeNull()
    expect(segments!.length).toBeGreaterThan(0)

    // Fetch and validate first segment
    const segRes = await app.request(`/api/streams/${sessionId}/${segments![0]}`)
    expect(segRes.status).toBe(200)
    expect(segRes.headers.get('Content-Type')).toBe('video/mp2t')

    const segBytes = await segRes.arrayBuffer()
    expect(segBytes.byteLength).toBeGreaterThan(0)

    // MPEG-TS sync byte check (0x47 at start of every 188-byte packet)
    const view = new Uint8Array(segBytes)
    expect(view[0]).toBe(0x47)

    // Release the stream session
    const delRes = await app.request(`/api/streams/${sessionId}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)
  }, 30_000)

  test('録画をDBとディスクから削除し、取得できないことを確認', async () => {
    expect(recordingFilePath).not.toBeNull()
    expect(recordingId).not.toBeNull()

    await unlink(recordingFilePath!)
    recordingFilePath = null

    await prisma.recording.delete({ where: { id: recordingId! } })
    await prisma.recordingSchedule.delete({ where: { id: scheduleId! } })

    const res = await app.request(`/api/recordings/${recordingId}`)
    expect(res.status).toBe(404)

    scheduleId = null
    recordingId = null
  })
})
