import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
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
      return c.json({ error: { code: statusToCode(err.status), message: err.message }, requestId: rid }, err.status)
    }
    pinoLogger.error({ err, requestId: rid }, 'unhandled error')
    return c.json({ error: { code: 'INTERNAL', message: 'internal server error' }, requestId: rid }, 500)
  })
  .notFound((c) => {
    const rid = c.get('requestId')
    return c.json(
      { error: { code: 'NOT_FOUND', message: `no route for ${c.req.method} ${c.req.path}` }, requestId: rid },
      404
    )
  })
  .route('/api/status', statusRoute)
  .route('/api/health', healthRoute)
  .route('/api/channels', channelsRoute)
  .route('/api/programs', programsRoute)
  .route('/api/streams', streamsRoute)
  .route('/api/recordings', recordingsRoute)
  .route('/api/recording-rules', recordingRulesRoute)

/** Map an HTTP status code to a stable string code that the client can pattern-match on. */
function statusToCode(status: ContentfulStatusCode): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 422:
      return 'UNPROCESSABLE'
    case 429:
      return 'RATE_LIMITED'
    case 503:
      return 'UNAVAILABLE'
    default:
      return status >= 500 ? 'INTERNAL' : 'ERROR'
  }
}

export { app }
export type AppType = typeof app
