import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { StartStreamRequestSchema, type StartStreamResponse, StartStreamResponseSchema } from '../schemas/Stream.dto'
import { streamManager } from '../services/stream-manager'

const SegmentParamSchema = z.object({
  sessionId: z.string().uuid(),
  segment: z.string().regex(/^\d{4}\.ts$/)
})

const SessionParamSchema = z.object({
  sessionId: z.string().uuid()
})

const StartStreamParamSchema = z.object({
  channelId: z.string()
})

const StartRecordingStreamParamSchema = z.object({
  recordingId: z.string().uuid()
})

const routeLogger = logger.child({ module: 'streams-route' })

const streamsRoute = new Hono()
  .post(
    '/live/:channelId',
    zValidator('param', StartStreamParamSchema),
    zValidator('json', StartStreamRequestSchema),
    async (c) => {
      const { channelId } = c.req.valid('param')
      const { codec, quality } = c.req.valid('json')

      try {
        const { sessionId, playlistUrl } = await streamManager.acquireLive(channelId, codec, quality)

        const body = {
          sessionId,
          playlistUrl
        } satisfies StartStreamResponse

        StartStreamResponseSchema.parse(body)

        return c.json(body, 201)
      } catch (err) {
        routeLogger.error({ channelId, codec, quality, err }, 'failed to start live stream')
        return c.json(
          { error: { code: 'STREAM_START_FAILED', message: err instanceof Error ? err.message : 'unknown error' } },
          503,
          { 'Retry-After': '2' }
        )
      }
    }
  )
  .post('/recording/:recordingId', zValidator('param', StartRecordingStreamParamSchema), async (c) => {
    const { recordingId } = c.req.valid('param')

    // Look up the Recording row to get the file path
    const row = await prisma.recording.findUnique({ where: { id: recordingId } })
    if (!row) {
      return c.json({ error: { code: 'RECORDING_NOT_FOUND', message: 'recording not found' } }, 404)
    }
    if (!row.filePath) {
      return c.json({ error: { code: 'RECORDING_FILE_MISSING', message: 'recording file path is not available' } }, 422)
    }

    // Verify the file actually exists on disk before spawning FFmpeg
    const fileExists = await Bun.file(row.filePath).exists()
    if (!fileExists) {
      return c.json(
        { error: { code: 'RECORDING_FILE_NOT_FOUND', message: `recording file not found on disk: ${row.filePath}` } },
        404
      )
    }

    try {
      const { sessionId, playlistUrl } = await streamManager.acquireRecording(recordingId, row.filePath)

      const body = {
        sessionId,
        playlistUrl
      } satisfies StartStreamResponse

      StartStreamResponseSchema.parse(body)

      return c.json(body, 201)
    } catch (err) {
      routeLogger.error({ recordingId, err }, 'failed to start recording stream')
      return c.json(
        { error: { code: 'STREAM_START_FAILED', message: err instanceof Error ? err.message : 'unknown error' } },
        503,
        { 'Retry-After': '2' }
      )
    }
  })
  .delete('/:sessionId', zValidator('param', SessionParamSchema), (c) => {
    const { sessionId } = c.req.valid('param')
    streamManager.release(sessionId)
    return new Response(null, { status: 204 })
  })
  .get('/:sessionId/info', zValidator('param', SessionParamSchema), async (c) => {
    const { sessionId } = c.req.valid('param')

    // Verify session exists before committing to SSE
    const info = streamManager.getStreamInfo(sessionId)
    if (info === null) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'stream session not found' } }, 404)
    }

    return streamSSE(c, async (stream) => {
      const signal = c.req.raw.signal

      const send = async (): Promise<boolean> => {
        if (signal.aborted) return false
        const current = streamManager.getStreamInfo(sessionId)
        if (current === null) return false
        await stream.writeSSE({ data: JSON.stringify(current) })
        return true
      }

      // Send an immediate snapshot, then every 1 s
      if (!(await send())) return

      const interval = setInterval(async () => {
        const ok = await send()
        if (!ok) clearInterval(interval)
      }, 1_000)

      // Clean up when the client disconnects
      signal.addEventListener('abort', () => clearInterval(interval), { once: true })

      // Keep the SSE connection alive until the client disconnects or session ends
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true })
      })

      clearInterval(interval)
    })
  })
  .get('/:sessionId/playlist.m3u8', zValidator('param', SessionParamSchema), async (c) => {
    const { sessionId } = c.req.valid('param')

    const dir = streamManager.getSessionDir(sessionId)
    if (dir === null) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'stream session not found' } }, 404)
    }

    const file = Bun.file(`${dir}/playlist.m3u8`)
    if (!(await file.exists())) {
      return c.json({ error: { code: 'PLAYLIST_NOT_READY', message: 'playlist not yet available' } }, 503, {
        'Retry-After': '1'
      })
    }

    return new Response(file.stream(), {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store'
      }
    })
  })
  .get('/:sessionId/:segment', zValidator('param', SegmentParamSchema), async (c) => {
    const { sessionId, segment } = c.req.valid('param')

    const dir = streamManager.getSessionDir(sessionId)
    if (dir === null) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'stream session not found' } }, 404)
    }

    const file = Bun.file(`${dir}/${segment}`)
    if (!(await file.exists())) {
      return c.json({ error: { code: 'SEGMENT_NOT_FOUND', message: 'segment not found' } }, 404)
    }

    return new Response(file.stream(), {
      headers: {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'public, max-age=6'
      }
    })
  })

export default streamsRoute
