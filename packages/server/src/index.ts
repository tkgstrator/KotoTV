import { mkdir } from 'node:fs/promises'
import { app } from './app'
import { env } from './lib/config'
import { logger } from './lib/logger'
import { ensureDefaultEncodeProfile } from './routes/encode-profiles'
import { startEpgSyncScheduler, stopEpgSyncScheduler } from './services/epg-sync'
import { startRecordingManager, stopRecordingManager } from './services/recording-manager'
import { stopRuleMatcherScheduler } from './services/rule-matcher'
import { streamManager } from './services/stream-manager'

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

// Seed the CPU default profile so the Settings > エンコード tab never
// lands on an empty list; non-blocking.
ensureDefaultEncodeProfile().catch((err) => {
  logger.warn({ err }, 'failed to ensure default encode profile')
})

// Start EPG sync (initial run + 15-min scheduler); non-blocking
startEpgSyncScheduler()

// Start recording manager (loads pending schedules + 30s poll); non-blocking
startRecordingManager()

async function gracefulShutdown(): Promise<void> {
  await Promise.all([
    stopEpgSyncScheduler(),
    stopRuleMatcherScheduler(),
    stopRecordingManager(),
    streamManager.shutdownAll()
  ])
  await server.stop()
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
