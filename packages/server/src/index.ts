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

/** Orchestrated shutdown — schedulers first so they stop queueing new work,
 *  then drain in-flight HTTP. Guarded by a 10s hard-exit timer in case a
 *  scheduler or connection hangs. */
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutdown requested')

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out after 10s, forcing exit')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  try {
    await Promise.all([Promise.resolve(stopEpgSyncScheduler()), Promise.resolve(stopRuleMatcherScheduler())])
    logger.info('schedulers stopped')
    await server.stop()
    logger.info('http server stopped')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
