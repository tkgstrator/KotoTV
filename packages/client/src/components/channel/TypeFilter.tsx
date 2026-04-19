import { useRef } from 'react'
import { manualTabClass } from '@/lib/tab-bar'

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
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIdx = (idx + 1) % TABS.length
      const nextTab = TABS[nextIdx]
      if (!nextTab) return
      onChange(nextTab.value)
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
      buttons?.[nextIdx]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIdx = (idx - 1 + TABS.length) % TABS.length
      const prevTab = TABS[prevIdx]
      if (!prevTab) return
      onChange(prevTab.value)
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
      buttons?.[prevIdx]?.focus()
    }
  }

  return (
    <div ref={listRef} role='tablist' aria-label='チャンネル種別' className='flex h-full w-full'>
      {TABS.map((tab, idx) => (
        <button
          key={tab.value}
          type='button'
          role='tab'
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          className={manualTabClass(value === tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
