import pino, { type DestinationStream, type StreamEntry } from 'pino'
import pretty from 'pino-pretty'
import { env } from './config'
import { type LogLevel, type LogSubsystem, pushLogLine } from './log-buffer'

// ---------------------------------------------------------------------------
// Subsystem routing: each log record carries a `module` tag (added via
// `logger.child({ module: ... })` or inline). This table decides which
// subsystem tab a record shows up in on the settings status page.
// ---------------------------------------------------------------------------

const MODULE_SUBSYSTEM: Record<string, LogSubsystem> = {
  'mirakc-client': 'mirakc',
  'epg-sync': 'mirakc',
  mirakc: 'mirakc',
  transcoder: 'ffmpeg',
  'stream-manager': 'ffmpeg',
  'streams-route': 'ffmpeg',
  ffmpeg: 'ffmpeg',
  'rule-matcher': 'postgres',
  'recording-rules': 'postgres',
  postgres: 'postgres',
  tuners: 'tuners'
}

// pino numeric → our UI enum (info/warn/error/debug).
function pinoLevelToName(level: number): LogLevel {
  if (level >= 50) return 'error'
  if (level >= 40) return 'warn'
  if (level <= 20) return 'debug'
  return 'info'
}

const bufferStream: DestinationStream = {
  write(chunk: string) {
    try {
      const obj = JSON.parse(chunk) as {
        level?: number
        module?: unknown
        msg?: unknown
      }
      if (typeof obj.module !== 'string') return
      const subsystem = MODULE_SUBSYSTEM[obj.module]
      if (!subsystem) return
      const message = typeof obj.msg === 'string' ? obj.msg : ''
      pushLogLine(subsystem, pinoLevelToName(obj.level ?? 30), message)
    } catch {
      // ignore unparseable pino output
    }
  }
}

const streams: StreamEntry[] = [{ stream: bufferStream, level: 'debug' }]
if (env.NODE_ENV === 'production') {
  streams.push({ stream: process.stdout, level: 'info' })
} else {
  // Sync pretty printer avoids the worker-thread transport so the buffer
  // stream gets the raw JSON lines it can parse.
  streams.push({ stream: pretty({ colorize: true, sync: true }), level: 'debug' })
}

export const logger = pino(
  {
    base: { service: 'server' },
    level: Bun.env.LOG_LEVEL ?? 'info'
  },
  pino.multistream(streams)
)
