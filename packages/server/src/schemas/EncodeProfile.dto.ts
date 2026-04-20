import { z } from 'zod'
import { RuleEncodeCodecSchema, RuleEncodeQualitySchema, RuleEncodeTimingSchema } from './RecordingRule.dto'

export const HwAccelTypeSchema = z.enum(['cpu', 'nvenc', 'vaapi'])
export const RateControlSchema = z.enum(['cbr', 'vbr', 'cqp'])
export const EncodeModeSchema = z.enum(['simple', 'advanced'])

export const EncodeProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  mode: EncodeModeSchema,
  codec: RuleEncodeCodecSchema,
  quality: RuleEncodeQualitySchema,
  timing: RuleEncodeTimingSchema,
  hwAccel: HwAccelTypeSchema,
  rateControl: RateControlSchema,
  bitrateKbps: z.number().int().min(500).max(80000),
  qpValue: z.number().int().min(0).max(51),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const CreateEncodeProfileSchema = EncodeProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  mode: EncodeModeSchema.default('simple'),
  codec: RuleEncodeCodecSchema.default('avc'),
  quality: RuleEncodeQualitySchema.default('medium'),
  timing: RuleEncodeTimingSchema.default('immediate'),
  hwAccel: HwAccelTypeSchema.default('cpu'),
  rateControl: RateControlSchema.default('vbr'),
  bitrateKbps: z.number().int().min(500).max(80000).default(4000),
  qpValue: z.number().int().min(0).max(51).default(23),
  isDefault: z.boolean().default(false)
})

export const UpdateEncodeProfileSchema = CreateEncodeProfileSchema.partial()

export type HwAccelType = z.infer<typeof HwAccelTypeSchema>
export type RateControl = z.infer<typeof RateControlSchema>
export type EncodeMode = z.infer<typeof EncodeModeSchema>
export type EncodeProfile = z.infer<typeof EncodeProfileSchema>
export type CreateEncodeProfile = z.infer<typeof CreateEncodeProfileSchema>
export type UpdateEncodeProfile = z.infer<typeof UpdateEncodeProfileSchema>
