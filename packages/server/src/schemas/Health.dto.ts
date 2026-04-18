import { z } from 'zod'

export const SubsystemStatusSchema = z.object({
  status: z.enum(['ok', 'warn', 'err']),
  detail: z.string()
})

export const DiskStatusSchema = SubsystemStatusSchema.extend({
  breakdown: z.object({
    recordings: z.number(),
    hlsTmpfs: z.number(),
    free: z.number(),
    total: z.number()
  })
})

export const HealthResponseSchema = z.object({
  mirakc: SubsystemStatusSchema,
  postgres: SubsystemStatusSchema,
  ffmpeg: SubsystemStatusSchema,
  tuners: SubsystemStatusSchema,
  disk: DiskStatusSchema
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const LogSubsystemParamSchema = z.object({
  subsystem: z.enum(['mirakc', 'postgres', 'ffmpeg', 'tuners'])
})

export const LogLineSchema = z.object({
  ts: z.string(),
  level: z.enum(['info', 'warn', 'error', 'debug']),
  message: z.string()
})

export const HealthLogsResponseSchema = z.object({
  lines: z.array(LogLineSchema)
})

export type HealthLogsResponse = z.infer<typeof HealthLogsResponseSchema>
