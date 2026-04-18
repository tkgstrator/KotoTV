import { mkdir } from 'node:fs/promises'
import { app } from './app'
import { env } from './lib/config'
import { logger } from './lib/logger'
import { startEpgSyncScheduler, stopEpgSyncScheduler } from './services/epg-sync'
import { stopRuleMatcherScheduler } from './services/rule-matcher'

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

// Start EPG sync (initial run + 15-min scheduler); non-blocking
startEpgSyncScheduler()

process.on('SIGTERM', async () => {
  await Promise.all([stopEpgSyncScheduler(), stopRuleMatcherScheduler()])
  await server.stop()
  process.exit(0)
})
