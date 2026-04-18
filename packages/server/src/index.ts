import { mkdir } from 'node:fs/promises'
import { app } from './app'
import { env } from './lib/config'
import { logger } from './lib/logger'

try {
  await mkdir(env.HLS_DIR, { recursive: true })
} catch (err) {
  logger.error({ err, HLS_DIR: env.HLS_DIR }, 'failed to create HLS_DIR — streams will fail until resolved')
}

const server = Bun.serve({
  fetch: app.fetch,
  port: env.PORT,
  development: env.NODE_ENV !== 'production',
  error: (err) => {
    logger.error({ err }, 'unhandled server error')
    return new Response('Internal Server Error', { status: 500 })
  }
})

logger.info({ port: server.port }, 'server listening')

process.on('SIGTERM', async () => {
  await server.stop()
  process.exit(0)
})
