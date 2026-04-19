import { HTTPException } from 'hono/http-exception'
import { prisma } from '../lib/prisma'

export interface ResolvedRecording {
  id: string
  filePath: string
  durationSec: number | null
}

/**
 * Look up a recording by id and return the file it plays from. Throws
 * HTTPException(404) if no matching row exists, so route handlers can
 * just `await` this and let Hono's onError pipeline emit the standard
 * { error: { code: 'NOT_FOUND', ... } } shape.
 *
 * The streaming layer consumes this once Mirakc is live — it takes the
 * filePath and hands it to `streamManager.acquireRecording`. Keeping
 * this lookup separate from the route handler means the swap to the
 * real transcoder stays a one-liner change in streams.ts.
 */
export async function resolveRecordingFile(id: string): Promise<ResolvedRecording> {
  const row = await prisma.recording.findUnique({
    where: { id },
    select: { id: true, filePath: true, durationSec: true }
  })
  if (!row) {
    throw new HTTPException(404, { message: `recording ${id} not found` })
  }
  if (!row.filePath) {
    // Recording row exists but FFmpeg hasn't produced the file yet
    // (status='scheduled' or 'recording' in flight). Treat as not-yet-playable.
    throw new HTTPException(409, { message: `recording ${id} has no file yet` })
  }
  return { id: row.id, filePath: row.filePath, durationSec: row.durationSec }
}
