import type { EncodeCodec, EncodeQuality, EncodeTiming } from './RecordingRule'

export type HwAccelType = 'cpu' | 'nvenc' | 'vaapi'

export interface EncodeProfile {
  id: string
  name: string
  codec: EncodeCodec
  quality: EncodeQuality
  timing: EncodeTiming
  hwAccel: HwAccelType
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type CreateEncodeProfile = Omit<EncodeProfile, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateEncodeProfile = Partial<CreateEncodeProfile>
