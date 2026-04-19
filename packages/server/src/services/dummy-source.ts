/**
 * Lazily downloads a known-good public-domain clip and returns a local path
 * that the dummy stream-manager can loop as its "Mirakc" source. Falls back
 * to null on any download failure — the caller then uses the lavfi testsrc
 * synthesis path so the pipe keeps working offline.
 */

import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { logger } from '../lib/logger'

// Big Buck Bunny — CC BY 3.0, Blender Foundation. ~60MB, 10 min — loops
// cleanly to fill any session length. Google CDN URL is the canonical
// sample-bucket asset.
const DEFAULT_SAMPLE_URL =
  process.env.DUMMY_VIDEO_URL ?? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
const DEFAULT_SAMPLE_PATH = process.env.DUMMY_VIDEO_PATH ?? './data/samples/big_buck_bunny.mp4'

let downloadPromise: Promise<string | null> | null = null

export async function getDummyVideoPath(): Promise<string | null> {
  // Already cached on disk? Use it immediately.
  if (existsSync(DEFAULT_SAMPLE_PATH)) {
    try {
      const st = await stat(DEFAULT_SAMPLE_PATH)
      if (st.size > 1_000_000) return DEFAULT_SAMPLE_PATH
      // Under 1MB means a previous download was truncated — start over.
    } catch {
      // continue and try to re-download
    }
  }

  // Coalesce concurrent callers onto the same in-flight download so we don't
  // open 3 sockets when the first few sessions start simultaneously.
  if (downloadPromise) return downloadPromise

  downloadPromise = (async () => {
    try {
      await mkdir(dirname(DEFAULT_SAMPLE_PATH), { recursive: true })
      logger.info({ module: 'dummy-source', url: DEFAULT_SAMPLE_URL }, 'downloading sample video')

      const res = await fetch(DEFAULT_SAMPLE_URL)
      if (!res.ok || !res.body) {
        throw new Error(`fetch ${DEFAULT_SAMPLE_URL} → ${res.status}`)
      }

      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(DEFAULT_SAMPLE_PATH)
        out.on('error', reject)
        out.on('finish', () => resolve())

        const reader = res.body?.getReader()
        if (!reader) return reject(new Error('no readable body'))

        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            out.write(value)
          }
          out.end()
        }
        pump().catch(reject)
      })

      const st = await stat(DEFAULT_SAMPLE_PATH)
      logger.info({ module: 'dummy-source', path: DEFAULT_SAMPLE_PATH, bytes: st.size }, 'sample video ready')
      return DEFAULT_SAMPLE_PATH
    } catch (err) {
      logger.warn({ module: 'dummy-source', err }, 'sample video unavailable — falling back to lavfi testsrc')
      return null
    } finally {
      downloadPromise = null
    }
  })()

  return downloadPromise
}

export function getCachedDummyVideoPath(): string | null {
  return existsSync(DEFAULT_SAMPLE_PATH) ? DEFAULT_SAMPLE_PATH : null
}

// Re-export the resolved path helper so tests can locate this module's
// output without import-side effects.
export function isSampleCached(): boolean {
  return existsSync(DEFAULT_SAMPLE_PATH)
}

// Expose for unit-test override
export const _internals = { DEFAULT_SAMPLE_PATH, DEFAULT_SAMPLE_URL }
