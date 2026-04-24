// Recording manager: schedule-based recording lifecycle.
// Loads pending RecordingSchedules from DB, fires at startAt, records via
// FFmpeg stream-copy, finalises the Recording row on completion.

import { rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../lib/config'
import { buildRecordArgs } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { emitRecordingEvent } from '../routes/recordings'
import { mirakcClient } from './mirakc-client'

// RECORDINGS_DIR is env.RECORDINGS_DIR (added to config.ts by backend agent).
// Fall back to a hardcoded default if the field is somehow absent at runtime.
const RECORDINGS_DIR: string = ((env as Record<string, unknown>).RECORDINGS_DIR as string) ?? './data/recordings'

const DB_POLL_INTERVAL_MS = 30_000

const rmgrLogger = logger.child({ module: 'recording-manager' })

// ---------------------------------------------------------------------------
// In-flight recording state
// ---------------------------------------------------------------------------

type ActiveRecording = {
  scheduleId: string
  recordingId: string
  /** FFmpeg process */
  proc: ReturnType<typeof Bun.spawn>
  /** Timer that sends SIGTERM at endAt */
  endTimer: ReturnType<typeof setTimeout>
  /** Absolute path of the .tmp.mp4 being written */
  tmpPath: string
  /** Absolute path of the final .mp4 after rename */
  finalPath: string
  startedAt: Date
}

const activeRecordings = new Map<string, ActiveRecording>() // scheduleId → state

// ---------------------------------------------------------------------------
// Scheduler state
// ---------------------------------------------------------------------------

/** scheduleId → pending start timer */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** IDs of schedules that have already been registered (to avoid double-fire on poll). */
const registeredIds = new Set<string>()

let pollTimer: ReturnType<typeof setInterval> | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startRecordingManager(): void {
  rmgrLogger.info('recording manager starting')
  void loadAndScheduleAll()

  pollTimer = setInterval(() => {
    void loadAndScheduleAll()
  }, DB_POLL_INTERVAL_MS)
  // Don't keep the event loop alive for the poll timer alone
  pollTimer.unref?.()
}

export async function stopRecordingManager(): Promise<void> {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  // Cancel all pending start timers
  for (const [id, timer] of pendingTimers) {
    clearTimeout(timer)
    pendingTimers.delete(id)
  }

  // SIGTERM all active recordings and wait for them to finish
  const stops = [...activeRecordings.values()].map((rec) => stopRecording(rec, 'server_shutdown'))
  await Promise.allSettled(stops)

  rmgrLogger.info('recording manager stopped')
}

// ---------------------------------------------------------------------------
// Schedule loading
// ---------------------------------------------------------------------------

async function loadAndScheduleAll(): Promise<void> {
  let schedules: Array<{
    id: string
    channelId: string
    title: string
    startAt: Date
    endAt: Date
    encodeProfileId: string | null
  }>

  try {
    schedules = await prisma.recordingSchedule.findMany({
      where: { status: 'pending' },
      select: { id: true, channelId: true, title: true, startAt: true, endAt: true, encodeProfileId: true }
    })
  } catch (err) {
    rmgrLogger.warn({ err }, 'failed to load pending recording schedules')
    return
  }

  const now = Date.now()

  for (const schedule of schedules) {
    if (registeredIds.has(schedule.id)) continue

    const delayMs = schedule.startAt.getTime() - now

    if (delayMs < 0) {
      // Past-due: mark as failed
      rmgrLogger.warn({ scheduleId: schedule.id, title: schedule.title }, 'schedule missed start — marking failed')
      registeredIds.add(schedule.id)
      void markScheduleFailed(schedule.id, 'missed_start')
      continue
    }

    registeredIds.add(schedule.id)
    rmgrLogger.info(
      { scheduleId: schedule.id, title: schedule.title, startAt: schedule.startAt, delayMs },
      'registering recording schedule'
    )

    const timer = setTimeout(() => {
      pendingTimers.delete(schedule.id)
      void fireRecording(schedule)
    }, delayMs)

    // Don't keep the event loop alive for distant timers
    timer.unref?.()
    pendingTimers.set(schedule.id, timer)
  }
}

// ---------------------------------------------------------------------------
// Recording lifecycle
// ---------------------------------------------------------------------------

async function fireRecording(schedule: {
  id: string
  channelId: string
  title: string
  startAt: Date
  endAt: Date
}): Promise<void> {
  const { id: scheduleId, channelId, title, endAt } = schedule

  rmgrLogger.info({ scheduleId, channelId, title }, 'recording starting')

  // 1. Mark schedule as recording
  try {
    await prisma.recordingSchedule.update({
      where: { id: scheduleId },
      data: { status: 'recording' }
    })
    emitRecordingEvent({ type: 'schedule-updated', scheduleId, status: 'recording' })
  } catch (err) {
    rmgrLogger.error({ scheduleId, err }, 'failed to update schedule status to recording')
    return
  }

  // 2. Open Mirakc live stream
  let openResult: Awaited<ReturnType<typeof mirakcClient.openLiveStream>>
  try {
    openResult = await mirakcClient.openLiveStream(channelId)
  } catch (err) {
    rmgrLogger.error({ scheduleId, channelId, err }, 'failed to open live stream for recording')
    await markScheduleFailed(scheduleId, 'stream_open_failed')
    return
  }

  // 3. Build output paths
  const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 100)
  const startedAt = new Date()
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const basename = `${timestamp}_${safeTitle}`
  const tmpPath = path.join(RECORDINGS_DIR, `${basename}.tmp.mp4`)
  const finalPath = path.join(RECORDINGS_DIR, `${basename}.mp4`)

  // 4. Spawn FFmpeg
  const args = buildRecordArgs({ outputPath: tmpPath })
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(['ffmpeg', ...args], {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'pipe'
    })
  } catch (err) {
    await openResult.cancel()
    rmgrLogger.error({ scheduleId, err }, 'failed to spawn ffmpeg for recording')
    await markScheduleFailed(scheduleId, 'ffmpeg_spawn_failed')
    return
  }

  // Pipe stderr to logger — best effort, non-blocking
  const childLogger = rmgrLogger.child({ scheduleId })
  void drainStderr(proc.stderr as ReadableStream<Uint8Array>, childLogger)

  // Pump Mirakc stream into FFmpeg stdin
  void pumpStream(openResult.stream, proc, childLogger)

  // 5. Create Recording row
  let recordingId: string
  try {
    const row = await prisma.recording.create({
      data: {
        scheduleId,
        channelId,
        title,
        startedAt,
        status: 'recording'
      }
    })
    recordingId = row.id
    emitRecordingEvent({ type: 'status-changed', recordingId, status: 'recording' })
  } catch (err) {
    rmgrLogger.error({ scheduleId, err }, 'failed to create Recording row')
    proc.kill()
    await openResult.cancel()
    await markScheduleFailed(scheduleId, 'db_error')
    return
  }

  // 6. Schedule SIGTERM at endAt
  const msUntilEnd = endAt.getTime() - Date.now()
  const endTimer = setTimeout(
    () => {
      rmgrLogger.info({ scheduleId, recordingId }, 'endAt reached — sending SIGTERM to ffmpeg')
      proc.kill('SIGTERM')
    },
    Math.max(0, msUntilEnd)
  )
  endTimer.unref?.()

  const active: ActiveRecording = { scheduleId, recordingId, proc, endTimer, tmpPath, finalPath, startedAt }
  activeRecordings.set(scheduleId, active)

  // 7. Wait for FFmpeg exit, then finalise
  proc.exited
    .then((exitCode) => {
      rmgrLogger.info({ scheduleId, recordingId, exitCode }, 'ffmpeg recording process exited')
      void finaliseRecording(active)
    })
    .catch((err) => {
      rmgrLogger.error({ scheduleId, recordingId, err }, 'recording process exited with error')
      void finaliseRecording(active)
    })
}

async function finaliseRecording(active: ActiveRecording): Promise<void> {
  const { scheduleId, recordingId, endTimer, tmpPath, finalPath, startedAt } = active

  clearTimeout(endTimer)
  activeRecordings.delete(scheduleId)

  const endedAt = new Date()

  // Rename .tmp.mp4 → .mp4
  let fileSize: number | null = null
  let actualFinalPath: string | null = null
  try {
    await rename(tmpPath, finalPath)
    const s = await stat(finalPath)
    fileSize = s.size
    actualFinalPath = finalPath
  } catch (err) {
    rmgrLogger.warn({ scheduleId, recordingId, tmpPath, finalPath, err }, 'failed to rename recording file')
    // Attempt to use the tmp path directly if rename failed
    try {
      const s = await stat(tmpPath)
      fileSize = s.size
      actualFinalPath = tmpPath
    } catch {
      rmgrLogger.error({ scheduleId, recordingId, tmpPath }, 'recording file not found after ffmpeg exit')
    }
  }

  const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)

  // Update Recording row
  try {
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        endedAt,
        filePath: actualFinalPath,
        sizeBytes: fileSize !== null ? BigInt(fileSize) : null,
        durationSec,
        status: 'completed'
      }
    })
    await prisma.recordingSchedule.update({
      where: { id: scheduleId },
      data: { status: 'completed' }
    })

    emitRecordingEvent({ type: 'status-changed', recordingId, status: 'completed' })
    emitRecordingEvent({ type: 'schedule-updated', scheduleId, status: 'completed' })

    rmgrLogger.info({ scheduleId, recordingId, durationSec, sizeBytes: fileSize }, 'recording completed')
  } catch (err) {
    rmgrLogger.error({ scheduleId, recordingId, err }, 'failed to update recording on completion')
  }

  // 8. Fire thumbnail extraction as background job
  if (actualFinalPath !== null) {
    void extractThumbnail(recordingId, actualFinalPath)
  }
}

/** Stop a recording in progress (e.g. server shutdown or manual cancel). */
async function stopRecording(active: ActiveRecording, reason: string): Promise<void> {
  const { scheduleId, recordingId, proc, endTimer } = active

  rmgrLogger.info({ scheduleId, recordingId, reason }, 'stopping active recording')

  clearTimeout(endTimer)

  try {
    proc.kill('SIGTERM')
  } catch {
    // Process may already have exited
  }

  try {
    await proc.exited
  } catch {
    // Ignore
  }

  await finaliseRecording(active)
}

// ---------------------------------------------------------------------------
// Thumbnail extraction
// ---------------------------------------------------------------------------

async function extractThumbnail(recordingId: string, filePath: string): Promise<void> {
  const thumbPath = filePath.replace(/\.mp4$/, '_thumb.jpg')

  const args = ['-y', '-ss', '60', '-i', filePath, '-vframes', '1', '-q:v', '3', thumbPath]

  try {
    const proc = Bun.spawn(['ffmpeg', ...args], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore'
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      rmgrLogger.warn({ recordingId, thumbPath, exitCode }, 'thumbnail extraction ffmpeg exited non-zero')
      return
    }

    const thumbUrl = `/recordings/thumbnails/${path.basename(thumbPath)}`
    await prisma.recording.update({
      where: { id: recordingId },
      data: { thumbnailUrl: thumbUrl }
    })

    emitRecordingEvent({ type: 'thumbnail-ready', recordingId, thumbnailUrl: thumbUrl })
    rmgrLogger.info({ recordingId, thumbPath }, 'thumbnail extracted')
  } catch (err) {
    rmgrLogger.warn({ recordingId, err }, 'thumbnail extraction failed')
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function markScheduleFailed(scheduleId: string, reason: string): Promise<void> {
  try {
    await prisma.recordingSchedule.update({
      where: { id: scheduleId },
      data: { status: 'failed', failureReason: reason }
    })
    emitRecordingEvent({ type: 'schedule-updated', scheduleId, status: 'failed' })
  } catch (err) {
    rmgrLogger.warn({ scheduleId, reason, err }, 'failed to mark schedule as failed')
  }
}

// ---------------------------------------------------------------------------
// Stream helpers
// ---------------------------------------------------------------------------

async function pumpStream(
  source: ReadableStream<Uint8Array>,
  proc: ReturnType<typeof Bun.spawn>,
  childLogger: { debug: (msg: string | object, ...args: unknown[]) => void }
): Promise<void> {
  // stdin is FileSink when spawned with stdin: 'pipe'
  const sink = proc.stdin as import('bun').FileSink
  const reader = source.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      await sink.write(value)
    }
  } catch (err) {
    childLogger.debug({ err }, 'recording stdin pump error')
  } finally {
    try {
      sink.end()
    } catch {
      // stdin may already be closed
    }
  }
}

async function drainStderr(
  stderr: ReadableStream<Uint8Array>,
  childLogger: { debug: (msg: string | object, ...args: unknown[]) => void }
): Promise<void> {
  const decoder = new TextDecoder()
  const reader = stderr.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) childLogger.debug(line)
      }
    }
    if (buffer.trim()) childLogger.debug(buffer)
  } catch {
    // Stream closed abruptly
  }
}
