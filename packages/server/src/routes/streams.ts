import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { type StartStreamResponse, StartStreamResponseSchema } from '../schemas/Stream.dto'

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

const streamsRoute = new Hono()
  .post('/live/:channelId', zValidator('param', StartStreamParamSchema), async (c) => {
    const { channelId: _channelId } = c.req.valid('param')

    // TODO(mirakc): replace with streamManager.acquireLive(_channelId)
    const sessionId = crypto.randomUUID()
    const playlistUrl = `/api/streams/${sessionId}/playlist.m3u8`

    const body = {
      sessionId,
      playlistUrl
    } satisfies StartStreamResponse

    StartStreamResponseSchema.parse(body)

    return c.json(body, 201)
  })
  .post('/recording/:recordingId', zValidator('param', StartRecordingStreamParamSchema), async (c) => {
    const { recordingId: _recordingId } = c.req.valid('param')

    // TODO(mirakc): replace with streamManager.acquireRecording(_recordingId, filePath)
    const sessionId = crypto.randomUUID()
    const playlistUrl = `/api/streams/${sessionId}/playlist.m3u8`

    const body = {
      sessionId,
      playlistUrl
    } satisfies StartStreamResponse

    StartStreamResponseSchema.parse(body)

    return c.json(body, 201)
  })
  .delete('/:sessionId', zValidator('param', SessionParamSchema), (_c) => {
    // TODO(mirakc): replace with streamManager.release(sessionId)
    return new Response(null, { status: 204 })
  })
  .get('/:sessionId/playlist.m3u8', zValidator('param', SessionParamSchema), (c) => {
    // TODO(mirakc): replace with Bun.file(`${HLS_DIR}/${sessionId}/playlist.m3u8`).stream()
    return c.json({ error: { code: 'STREAM_NOT_READY', message: 'Mirakc offline' } }, 503, { 'Retry-After': '1' })
  })
  .get('/:sessionId/:segment', zValidator('param', SegmentParamSchema), (c) => {
    // TODO(mirakc): replace with Bun.file(`${HLS_DIR}/${sessionId}/${segment}`).stream()
    return c.json({ error: { code: 'STREAM_NOT_READY', message: 'Mirakc offline' } }, 503, { 'Retry-After': '1' })
  })

export default streamsRoute
