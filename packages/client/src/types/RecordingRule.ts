// TODO(types): switch to hc<AppType> once backend recording-rules endpoints land
// These types mirror the planned backend schema in docs/plans/phase-4-recording-rules.md

export type KeywordMode = 'literal' | 'regex'
export type KeywordTarget = 'title' | 'title_description'
export type EncodeCodec = 'avc' | 'hevc' | 'vp9'
export type EncodeQuality = 'high' | 'medium' | 'low'
export type EncodeTiming = 'immediate' | 'idle'

export interface RecordingRule {
  id: string
  name: string
  enabled: boolean
  keyword?: string | null
  keywordMode: KeywordMode
  keywordTarget: KeywordTarget
  excludeKeyword?: string | null
  channelIds: string[]
  genres: string[]
  dayOfWeek: number[]
  timeStartMinutes?: number | null
  timeEndMinutes?: number | null
  priority: number
  avoidDuplicates: boolean
  excludeReruns: boolean
  newOnly: boolean
  marginStartMinutes: number
  marginEndMinutes: number
  /** 0 = no minimum */
  minDurationMinutes: number
  /** 0 = unlimited retention */
  keepLatestN: number
  postEncode: boolean
  postEncodeCodec: EncodeCodec
  postEncodeQuality: EncodeQuality
  postEncodeTiming: EncodeTiming
  createdAt: string
  updatedAt: string
}

export type CreateRecordingRule = Omit<RecordingRule, 'id' | 'createdAt' | 'updatedAt'>

export interface RecordingRulePreviewResult {
  matchCount: number
  programs: Array<{
    programId: string
    channelId: string
    channelName: string
    title: string
    startAt: string
    endAt: string
  }>
}
