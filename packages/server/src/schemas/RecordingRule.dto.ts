import { z } from 'zod'

export const RuleKeywordModeSchema = z.enum(['literal', 'regex'])
export const RuleKeywordTargetSchema = z.enum(['title', 'title_description'])

export const RecordingRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  enabled: z.boolean(),
  keyword: z.string().max(200).nullable(),
  keywordMode: RuleKeywordModeSchema,
  keywordTarget: RuleKeywordTargetSchema,
  excludeKeyword: z.string().max(200).nullable(),
  channelIds: z.array(z.string()),
  genres: z.array(z.string()),
  dayOfWeek: z.array(z.number().int().min(0).max(6)),
  timeStartMinutes: z.number().int().min(0).max(1439).nullable(),
  timeEndMinutes: z.number().int().min(0).max(1439).nullable(),
  priority: z.number().int(),
  avoidDuplicates: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const CreateRecordingRuleSchema = RecordingRuleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  keyword: z.string().max(200).nullable().optional(),
  excludeKeyword: z.string().max(200).nullable().optional(),
  timeStartMinutes: z.number().int().min(0).max(1439).nullable().optional(),
  timeEndMinutes: z.number().int().min(0).max(1439).nullable().optional()
})

export const UpdateRecordingRuleSchema = CreateRecordingRuleSchema.partial()

export const ProgramSummaryForRuleSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
})

export const PreviewRecordingRuleRequestSchema = CreateRecordingRuleSchema.extend({
  windowHours: z.number().int().min(1).max(168).default(24),
  limit: z.number().int().min(1).max(200).default(50)
})

export const PreviewRecordingRuleResponseSchema = z.object({
  matchCount: z.number().int().nonnegative(),
  programs: z.array(ProgramSummaryForRuleSchema)
})

export const FailureReasonSchema = z.enum(['tuner_conflict', 'ffmpeg_exit', 'mirakc_unreachable', 'disk_full', 'other'])

export type RuleKeywordMode = z.infer<typeof RuleKeywordModeSchema>
export type RuleKeywordTarget = z.infer<typeof RuleKeywordTargetSchema>
export type RecordingRule = z.infer<typeof RecordingRuleSchema>
export type CreateRecordingRule = z.infer<typeof CreateRecordingRuleSchema>
export type UpdateRecordingRule = z.infer<typeof UpdateRecordingRuleSchema>
export type ProgramSummaryForRule = z.infer<typeof ProgramSummaryForRuleSchema>
export type PreviewRecordingRuleRequest = z.infer<typeof PreviewRecordingRuleRequestSchema>
export type PreviewRecordingRuleResponse = z.infer<typeof PreviewRecordingRuleResponseSchema>
export type FailureReason = z.infer<typeof FailureReasonSchema>
