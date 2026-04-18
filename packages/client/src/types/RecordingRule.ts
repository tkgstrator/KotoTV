// TODO(types): switch to hc<AppType> once backend recording-rules endpoints land
// These types mirror the planned backend schema in docs/plans/phase-4-recording-rules.md

export type KeywordMode = 'literal' | 'regex'
export type KeywordTarget = 'title' | 'title_description'

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
