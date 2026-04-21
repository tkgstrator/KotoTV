import type { EncodeCodec, EncodeQuality, EncodeTiming } from './RecordingRule'

export type HwAccelType = 'cpu' | 'nvenc' | 'vaapi'
export type RateControl = 'cbr' | 'vbr' | 'cqp'
export type EncodeMode = 'simple' | 'advanced'
export type Resolution = 'hd1080' | 'hd720' | 'sd480'

export interface EncodeProfile {
  id: string
  name: string
  mode: EncodeMode
  codec: EncodeCodec
  quality: EncodeQuality
  timing: EncodeTiming
  hwAccel: HwAccelType
  rateControl: RateControl
  bitrateKbps: number
  qpValue: number
  isDefault: boolean
  keepOriginalResolution: boolean
  resolution: Resolution
  createdAt: string
  updatedAt: string
}

export type CreateEncodeProfile = Omit<EncodeProfile, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateEncodeProfile = Partial<CreateEncodeProfile>

export interface BenchmarkRequest {
  codec: EncodeCodec
  quality: EncodeQuality
  timing: EncodeTiming
  hwAccel: HwAccelType
  mode: EncodeMode
  rateControl: RateControl
  bitrateKbps: number
  qpValue: number
  keepOriginalResolution: boolean
  resolution: Resolution
  profileId?: string
}

export interface BenchmarkResponse {
  ok: boolean
  fps: number
  wallSeconds: number
  reason?: string
}

export interface BenchmarkLog {
  id: string
  createdAt: string
  codec: EncodeCodec
  hwAccel: HwAccelType
  rateControl: RateControl
  bitrateKbps: number
  qpValue: number
  keepOriginalResolution: boolean
  resolution: Resolution
  ok: boolean
  fps: number
  wallSeconds: number
  reason: string | null
  profileId: string | null
  profileName: string | null
}

export interface BenchmarkHistoryResponse {
  items: BenchmarkLog[]
}
