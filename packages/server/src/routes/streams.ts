import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type StartStreamResponse, StartStreamResponseSchema } from '../schemas/Stream.dto'
import { resolveRecordingFile } from '../services/recording-service'
import { acquireLive, getSessionDir, release } from '../services/stream-manager'

const SegmentParamSchema = z.object({
  sessionId: z.string().uuid(),
  segment: z.string().regex(/^(?:\d{4}\.ts|\d{4}\.m4s|init\.mp4)$/)
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

const LiveQueryParamSchema = z.object({
  quality: z.enum(['auto', 'high', 'medium', 'low']).optional(),
  codec: z.enum(['avc', 'hevc', 'vp9']).optional()
})

async function serveFile(path: string): Promise<Response> {
  if (!existsSync(path)) {
    return new Response(JSON.stringify({ error: { code: 'STREAM_NOT_READY', message: 'segment not ready' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '1' }
    })
  }
  const contentType = path.endsWith('.m3u8')
    ? 'application/vnd.apple.mpegurl'
    : path.endsWith('.m4s') || path.endsWith('.mp4')
      ? 'video/mp4'
      : 'video/mp2t'
  const file = Bun.file(path)
  return new Response(file.stream(), {
    headers: {
      'content-type': contentType,
      // Playlists change constantly; segments are immutable once written.
      'cache-control': path.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=3600'
    }
  })
}

const streamsRoute = new Hono()
  .post(
    '/live/:channelId',
    zValidator('param', StartStreamParamSchema),
    zValidator('query', LiveQueryParamSchema),
    async (c) => {
      const { channelId } = c.req.valid('param')
      const { quality = 'auto', codec = 'avc' } = c.req.valid('query')

      const { sessionId, playlistUrl } = await acquireLive({ channelId, quality, codec })

      const body = { sessionId, playlistUrl } satisfies StartStreamResponse
      StartStreamResponseSchema.parse(body)
      return c.json(body, 201)
    }
  )
  .post('/recording/:recordingId', zValidator('param', StartRecordingStreamParamSchema), async (c) => {
    const { recordingId } = c.req.valid('param')

    // Verify the recording exists before minting a session.
    const rec = await resolveRecordingFile(recordingId)

    // TODO(mirakc-recording): hand rec.filePath to a recording-specific
    // transcoder. Dummy live path doesn't apply here.
    const sessionId = crypto.randomUUID()
    const playlistUrl = `/api/streams/${sessionId}/playlist.m3u8`

    const body = { sessionId, playlistUrl } satisfies StartStreamResponse
    StartStreamResponseSchema.parse(body)
    return c.json(body, 201)
  })
  .delete('/:sessionId', zValidator('param', SessionParamSchema), async (c) => {
    const { sessionId } = c.req.valid('param')
    release(sessionId)
    return new Response(null, { status: 204 })
  })
  .get('/:sessionId/playlist.m3u8', zValidator('param', SessionParamSchema), async (c) => {
    const { sessionId } = c.req.valid('param')
    const dir = getSessionDir(sessionId)
    if (!dir) throw new HTTPException(404, { message: 'session not found' })
    const res = await serveFile(`${dir}/playlist.m3u8`)
    // Tag the response so CORS / logging upstream can distinguish playlist hits.
    res.headers.set('X-Kototv-Session', sessionId)
    return res
  })
  .get('/:sessionId/:segment', zValidator('param', SegmentParamSchema), async (c) => {
    const { sessionId, segment } = c.req.valid('param')
    const dir = getSessionDir(sessionId)
    if (!dir) throw new HTTPException(404, { message: 'session not found' })

    const path = `${dir}/${segment}`
    // Segments can lag the playlist briefly — FFmpeg writes them atomically
    // but there's a small window between appearing in the playlist and
    // finishing on disk. Respond 503 if the file isn't there yet so hls.js
    // retries.
    if (!existsSync(path)) {
      return new Response(JSON.stringify({ error: { code: 'SEGMENT_NOT_READY', message: 'segment not ready' } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'retry-after': '1' }
      })
    }
    const st = await stat(path)
    if (st.size === 0) {
      return new Response(JSON.stringify({ error: { code: 'SEGMENT_NOT_READY', message: 'segment empty' } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'retry-after': '1' }
      })
    }
    return serveFile(path)
  })

export default streamsRoute
