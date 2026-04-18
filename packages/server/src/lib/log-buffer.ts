export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type LogLine = {
  ts: string
  level: LogLevel
  message: string
}

export type LogSubsystem = 'mirakc' | 'postgres' | 'ffmpeg' | 'tuners'

const MAX_SIZE = 100

class RingBuffer {
  private buf: LogLine[] = []
  private writeIdx = 0
  private count = 0

  push(line: LogLine): void {
    if (this.count < MAX_SIZE) {
      this.buf[this.writeIdx] = line
      this.writeIdx = (this.writeIdx + 1) % MAX_SIZE
      this.count++
    } else {
      this.buf[this.writeIdx] = line
      this.writeIdx = (this.writeIdx + 1) % MAX_SIZE
    }
  }

  tail(): LogLine[] {
    if (this.count < MAX_SIZE) {
      return this.buf.slice(0, this.count)
    }
    // Ring has wrapped: oldest entry starts at writeIdx
    const result: LogLine[] = []
    for (let i = 0; i < MAX_SIZE; i++) {
      // buf is fully populated when count === MAX_SIZE, so the cast is safe
      result.push(this.buf[(this.writeIdx + i) % MAX_SIZE] as LogLine)
    }
    return result
  }
}

const buffers: Record<LogSubsystem, RingBuffer> = {
  mirakc: new RingBuffer(),
  postgres: new RingBuffer(),
  ffmpeg: new RingBuffer(),
  tuners: new RingBuffer()
}

export function pushLogLine(subsystem: LogSubsystem, level: LogLevel, message: string): void {
  buffers[subsystem].push({ ts: new Date().toISOString(), level, message })
}

export function getLogTail(subsystem: LogSubsystem): LogLine[] {
  return buffers[subsystem].tail()
}
