import { UnderlineTabBar } from '@/components/shared/underline-tab-bar'

export type FilterValue = 'ALL' | 'GR' | 'BS' | 'CS'

const TABS: { value: FilterValue; label: string }[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'GR', label: 'GR' },
  { value: 'BS', label: 'BS' },
  { value: 'CS', label: 'CS' }
]

interface TypeFilterProps {
  value: FilterValue
  onChange: (v: FilterValue) => void
}

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return <UnderlineTabBar<FilterValue> tabs={TABS} value={value} onChange={onChange} ariaLabel='チャンネル種別' />
}
