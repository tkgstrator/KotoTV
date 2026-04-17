import { z } from 'zod'

export const MirakcServiceSchema = z
  .object({
    id: z.number().int(),
    serviceId: z.number().int(),
    networkId: z.number().int(),
    type: z.number().int(),
    name: z.string(),
    channel: z
      .object({
        type: z.enum(['GR', 'BS', 'CS', 'SKY']),
        channel: z.string()
      })
      .optional()
  })
  .passthrough()

export const MirakcProgramSchema = z
  .object({
    id: z.number().int(),
    serviceId: z.number().int(),
    startAt: z.number().int(),
    duration: z.number().int(),
    name: z.string().optional(),
    description: z.string().optional(),
    genres: z.array(z.object({ lv1: z.number().int(), lv2: z.number().int() }).passthrough()).optional()
  })
  .passthrough()

export const ChannelTypeSchema = z.enum(['GR', 'BS', 'CS', 'SKY'])

export const ProgramSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  synopsis: z.string().optional()
})

export const ChannelSchema = z.object({
  id: z.string(),
  type: ChannelTypeSchema,
  serviceId: z.number().int(),
  networkId: z.number().int(),
  name: z.string(),
  channelNumber: z.string(),
  hasLogo: z.boolean(),
  currentProgram: ProgramSummarySchema.nullable(),
  nextProgram: ProgramSummarySchema.nullable()
})

export const ChannelListResponseSchema = z.object({
  channels: z.array(ChannelSchema),
  updatedAt: z.string()
})

export const ChannelListQuerySchema = z.object({
  type: ChannelTypeSchema.optional()
})

export type MirakcService = z.infer<typeof MirakcServiceSchema>
export type MirakcProgram = z.infer<typeof MirakcProgramSchema>
export type ChannelType = z.infer<typeof ChannelTypeSchema>
export type ProgramSummary = z.infer<typeof ProgramSummarySchema>
export type Channel = z.infer<typeof ChannelSchema>
export type ChannelListResponse = z.infer<typeof ChannelListResponseSchema>
