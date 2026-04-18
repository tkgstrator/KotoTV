import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import { logger as pinoLogger } from './lib/logger'
import channelsRoute from './routes/channels'
import programsRoute from './routes/programs'
import recordingRulesRoute from './routes/recording-rules'
import recordingsRoute from './routes/recordings'
import { healthRoute, statusRoute } from './routes/status'
import streamsRoute from './routes/streams'

const app = new Hono()
  .use('*', requestId())
  .use('*', async (c, next) => {
    const start = Date.now()
    await next()
    pinoLogger.info({
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start
    })
  })
  .onError((err, c) => {
    const rid = c.get('requestId')
    if (err instanceof HTTPException) {
      return c.json({ error: { code: err.status, message: err.message }, requestId: rid }, err.status)
    }
    pinoLogger.error({ err, requestId: rid }, 'unhandled error')
    return c.json({ error: { code: 500, message: 'internal server error' }, requestId: rid }, 500)
  })
  .route('/api/status', statusRoute)
  .route('/api/health', healthRoute)
  .route('/api/channels', channelsRoute)
  .route('/api/programs', programsRoute)
  .route('/api/streams', streamsRoute)
  .route('/api/recordings', recordingsRoute)
  .route('/api/recording-rules', recordingRulesRoute)

export { app }
export type AppType = typeof app
