import { z } from 'zod'

export const ScheduleStatusSchema = z.enum(['pending', 'recording', 'completed', 'failed', 'cancelled'])
export const RecordingStatusSchema = z.enum(['recording', 'completed', 'failed'])

export const RecordingScheduleSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  programId: z.string(),
  title: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  status: ScheduleStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const RecordingSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  channelId: z.string(),
  title: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  filePath: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  durationSec: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  status: RecordingStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const CreateRecordingScheduleSchema = z
  .object({
    channelId: z.string().min(1),
    programId: z.string().min(1),
    title: z.string().min(1),
    startAt: z.string().datetime(),
    endAt: z.string().datetime()
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), { message: 'endAt must be after startAt' })

export const RecordingListResponseSchema = z.object({
  schedules: z.array(RecordingScheduleSchema),
  recordings: z.array(RecordingSchema)
})

export const RecordingEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status-changed'),
    recordingId: z.string().uuid(),
    status: RecordingStatusSchema
  }),
  z.object({
    type: z.literal('thumbnail-ready'),
    recordingId: z.string().uuid(),
    thumbnailUrl: z.string()
  }),
  z.object({
    type: z.literal('schedule-updated'),
    scheduleId: z.string().uuid(),
    status: ScheduleStatusSchema
  })
])

export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>
export type RecordingSchedule = z.infer<typeof RecordingScheduleSchema>
export type Recording = z.infer<typeof RecordingSchema>
export type CreateRecordingSchedule = z.infer<typeof CreateRecordingScheduleSchema>
export type RecordingListResponse = z.infer<typeof RecordingListResponseSchema>
export type RecordingEvent = z.infer<typeof RecordingEventSchema>
