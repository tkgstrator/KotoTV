import { z } from 'zod'

export const StreamSchema = z.object({
  sessionId: z.string().uuid(),
  channelId: z.string(),
  playlistUrl: z.string(),
  createdAt: z.number().int(),
  viewerCount: z.number().int()
})

export const StartStreamResponseSchema = z.object({
  sessionId: z.string().uuid(),
  playlistUrl: z.string()
})

export const StartStreamRequestSchema = z.object({
  codec: z.enum(['avc', 'hevc']),
  quality: z.enum(['low', 'mid', 'high'])
})

export const StreamInfoSchema = z.object({
  codec: z.enum(['avc', 'hevc']),
  resolution: z.string().regex(/^\d+x\d+$/),
  bitrate: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  hwAccel: z.enum(['none', 'nvenc', 'qsv', 'vaapi']),
  viewerCount: z.number().int().nonnegative(),
  droppedFrames: z.number().int().nonnegative(),
  /** Client-side buffer in seconds. Server always returns 0; hls.js overlays the real value. */
  bufferSec: z.number().nonnegative()
})

export type Stream = z.infer<typeof StreamSchema>
export type StartStreamResponse = z.infer<typeof StartStreamResponseSchema>
export type StartStreamRequest = z.infer<typeof StartStreamRequestSchema>
export type StreamInfo = z.infer<typeof StreamInfoSchema>
