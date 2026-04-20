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

export const MirakcStatusSchema = SubsystemStatusSchema.extend({
  version: z.string().nullable()
})

export const PostgresStatusSchema = SubsystemStatusSchema.extend({
  version: z.string().nullable()
})

export const TunerDeviceSchema = z.object({
  name: z.string(),
  types: z.array(z.string()),
  command: z.string().nullable(),
  isFree: z.boolean()
})

export const TunersStatusSchema = SubsystemStatusSchema.extend({
  devices: z.array(TunerDeviceSchema)
})

export const RuntimeStatusSchema = z.object({
  name: z.string(),
  version: z.string()
})

export const HealthResponseSchema = z.object({
  mirakc: MirakcStatusSchema,
  postgres: PostgresStatusSchema,
  ffmpeg: SubsystemStatusSchema,
  tuners: TunersStatusSchema,
  disk: DiskStatusSchema,
  runtime: RuntimeStatusSchema
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
