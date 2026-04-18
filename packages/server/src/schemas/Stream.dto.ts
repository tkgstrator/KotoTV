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

export type Stream = z.infer<typeof StreamSchema>
export type StartStreamResponse = z.infer<typeof StartStreamResponseSchema>
