import type { EncodeCodec, EncodeQuality, EncodeTiming } from './RecordingRule'

export type HwAccelType = 'cpu' | 'nvenc' | 'vaapi'
export type RateControl = 'cbr' | 'vbr' | 'cqp'
export type EncodeMode = 'simple' | 'advanced'

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
  createdAt: string
  updatedAt: string
}

export type CreateEncodeProfile = Omit<EncodeProfile, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateEncodeProfile = Partial<CreateEncodeProfile>
