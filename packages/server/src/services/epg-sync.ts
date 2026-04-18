import { aribGenreToString } from '../lib/arib-genre'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { emitRecordingEvent } from '../routes/recordings'
import { mirakcClient } from './mirakc-client'
import { runRuleMatcher } from './rule-matcher'

const SYNC_INTERVAL_MS = 15 * 60 * 1000
const CONCURRENCY = 4

async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const settled = await Promise.allSettled(batch.map(fn))
    results.push(...settled)
  }
  return results
}

async function syncChannel(serviceId: number): Promise<number> {
  const programs = await mirakcClient.listPrograms(serviceId)
  const channelId = String(serviceId)
  const now = new Date()

  let upserted = 0
  for (const p of programs) {
    const endMs = p.startAt + p.duration
    const genres = (p.genres ?? []).map((g) => aribGenreToString(g.lv1, g.lv2))
    const uniqueGenres = [...new Set(genres)]

    await prisma.program.upsert({
      where: { id: String(p.id) },
      create: {
        id: String(p.id),
        channelId,
        title: p.name ?? '(無題)',
        description: p.description ?? null,
        startAt: new Date(p.startAt),
        endAt: new Date(endMs),
        genres: uniqueGenres,
        fetchedAt: now
      },
      update: {
        title: p.name ?? '(無題)',
        description: p.description ?? null,
        startAt: new Date(p.startAt),
        endAt: new Date(endMs),
        genres: uniqueGenres,
        fetchedAt: now
      }
    })
    upserted++
  }
  return upserted
}

export async function syncAllPrograms(): Promise<{
  upserted: number
  deleted: number
  failedChannels: string[]
}> {
  const services = await mirakcClient.listServices()
  const failedChannels: string[] = []
  let upserted = 0

  await withConcurrency(services, CONCURRENCY, async (service) => {
    try {
      const count = await syncChannel(service.serviceId)
      upserted += count
    } catch (err) {
      const channelId = String(service.serviceId)
      failedChannels.push(channelId)
      logger.warn({ module: 'epg-sync', channelId, err }, 'failed to sync channel EPG')
    }
  })

  // Remove programs that ended more than 24 hours ago
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const { count: deleted } = await prisma.program.deleteMany({
    where: { endAt: { lt: cutoff } }
  })

  logger.info({ module: 'epg-sync', upserted, deleted, failedChannels }, 'EPG sync complete')

  emitRecordingEvent({ type: 'epg-synced', upserted, deleted })

  return { upserted, deleted, failedChannels }
}

let _syncTimer: ReturnType<typeof setTimeout> | null = null
let _syncRunning: Promise<unknown> | null = null

export function startEpgSyncScheduler(): void {
  const tick = async () => {
    _syncRunning = syncAllPrograms()
      .then(async () => {
        // Run rule matcher after each EPG sync to pick up newly added programs
        await runRuleMatcher().catch((err) => {
          logger.warn({ module: 'epg-sync', err }, 'rule matcher run after EPG sync failed')
        })
      })
      .catch((err) => {
        logger.warn({ module: 'epg-sync', err }, 'EPG sync failed')
      })
    await _syncRunning
    _syncRunning = null
    _syncTimer = setTimeout(tick, SYNC_INTERVAL_MS)
  }

  // Initial run immediately on startup (non-blocking)
  _syncRunning = syncAllPrograms()
    .then(async () => {
      await runRuleMatcher().catch((err) => {
        logger.warn({ module: 'epg-sync', err }, 'rule matcher run after initial EPG sync failed')
      })
    })
    .catch((err) => {
      logger.warn({ module: 'epg-sync', err }, 'initial EPG sync failed')
    })
    .finally(() => {
      _syncRunning = null
      _syncTimer = setTimeout(tick, SYNC_INTERVAL_MS)
    })

  logger.info({ module: 'epg-sync', intervalMs: SYNC_INTERVAL_MS }, 'EPG sync scheduler started')
}

export async function stopEpgSyncScheduler(): Promise<void> {
  if (_syncTimer !== null) {
    clearTimeout(_syncTimer)
    _syncTimer = null
  }
  if (_syncRunning !== null) {
    await _syncRunning
  }
}
