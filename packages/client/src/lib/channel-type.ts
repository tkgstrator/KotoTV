import type { SegmentedFilterTab } from '@/components/shared/segmented-filter'

export type ChannelType = 'GR' | 'BS' | 'CS'

export const CHANNEL_TYPE_VALUES: readonly ChannelType[] = ['GR', 'BS', 'CS']

export const CHANNEL_TYPE_TABS: readonly SegmentedFilterTab<ChannelType>[] = [
  { value: 'GR', label: 'GR' },
  { value: 'BS', label: 'BS' },
  { value: 'CS', label: 'CS' }
]
