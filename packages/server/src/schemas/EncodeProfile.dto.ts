import { z } from 'zod'
import { RuleEncodeCodecSchema, RuleEncodeQualitySchema, RuleEncodeTimingSchema } from './RecordingRule.dto'

export const HwAccelTypeSchema = z.enum(['cpu', 'nvenc', 'vaapi'])

export const EncodeProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  codec: RuleEncodeCodecSchema,
  quality: RuleEncodeQualitySchema,
  timing: RuleEncodeTimingSchema,
  hwAccel: HwAccelTypeSchema,
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const CreateEncodeProfileSchema = EncodeProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  codec: RuleEncodeCodecSchema.default('avc'),
  quality: RuleEncodeQualitySchema.default('medium'),
  timing: RuleEncodeTimingSchema.default('immediate'),
  hwAccel: HwAccelTypeSchema.default('cpu'),
  isDefault: z.boolean().default(false)
})

export const UpdateEncodeProfileSchema = CreateEncodeProfileSchema.partial()

export type HwAccelType = z.infer<typeof HwAccelTypeSchema>
export type EncodeProfile = z.infer<typeof EncodeProfileSchema>
export type CreateEncodeProfile = z.infer<typeof CreateEncodeProfileSchema>
export type UpdateEncodeProfile = z.infer<typeof UpdateEncodeProfileSchema>
