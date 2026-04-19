import { z } from 'zod'

export const ProgramSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  genres: z.array(z.string()).default([]),
  isRecordable: z.boolean().default(true)
})

export const ProgramListResponseSchema = z.object({
  programs: z.array(ProgramSchema)
})

export const ProgramListQuerySchema = z.object({
  channelId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true })
})

export const ProgramGridQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true })
})

export const ProgramGridResponseSchema = z.object({
  programs: z.record(z.string(), z.array(ProgramSchema))
})

export type Program = z.infer<typeof ProgramSchema>
export type ProgramListResponse = z.infer<typeof ProgramListResponseSchema>
export type ProgramListQuery = z.infer<typeof ProgramListQuerySchema>
export type ProgramGridQuery = z.infer<typeof ProgramGridQuerySchema>
export type ProgramGridResponse = z.infer<typeof ProgramGridResponseSchema>
