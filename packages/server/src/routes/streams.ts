import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { logger } from '../lib/logger'
import { type StartStreamResponse, StartStreamResponseSchema } from '../schemas/Stream.dto'
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
  .post('/live/:channelId', zValidator('param', StartStreamParamSchema), async (c) => {
    const { channelId } = c.req.valid('param')

    try {
      const { sessionId, playlistUrl } = await streamManager.acquireLive(channelId)

      const body = {
        sessionId,
        playlistUrl
      } satisfies StartStreamResponse

      StartStreamResponseSchema.parse(body)

      return c.json(body, 201)
    } catch (err) {
      routeLogger.error({ channelId, err }, 'failed to start live stream')
      return c.json(
        { error: { code: 'STREAM_START_FAILED', message: err instanceof Error ? err.message : 'unknown error' } },
        503,
        { 'Retry-After': '2' }
      )
    }
  })
  .post('/recording/:recordingId', zValidator('param', StartRecordingStreamParamSchema), async (c) => {
    const { recordingId: _recordingId } = c.req.valid('param')

    // TODO(phase-5): replace with streamManager.acquireRecording(_recordingId, filePath)
    const sessionId = crypto.randomUUID()
    const playlistUrl = `/api/streams/${sessionId}/playlist.m3u8`

    const body = {
      sessionId,
      playlistUrl
    } satisfies StartStreamResponse

    StartStreamResponseSchema.parse(body)

    return c.json(body, 201)
  })
  .delete('/:sessionId', zValidator('param', SessionParamSchema), (c) => {
    const { sessionId } = c.req.valid('param')
    streamManager.release(sessionId)
    return new Response(null, { status: 204 })
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
