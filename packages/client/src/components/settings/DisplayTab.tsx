import { SEGMENT_ITEM_CLASS, SectHead } from '@/components/settings/_shared'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type ThemeChoice, useTheme } from '@/hooks/useTheme'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'LIGHT' },
  { value: 'dark', label: 'DARK' },
  { value: 'system', label: 'AUTO' }
]

function ThemeSegment() {
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type='single'
      value={theme}
      onValueChange={(v) => v && setTheme(v as ThemeChoice)}
      aria-label='テーマ選択'
      size='sm'
      className='shrink-0'
    >
      {THEME_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className={SEGMENT_ITEM_CLASS}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function DisplayTab() {
  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead>テーマ</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <div className='flex items-center justify-between gap-4 px-3.5 py-3'>
          <div>
            <p className='text-[0.875rem] font-medium text-foreground'>テーマ</p>
            <p className='mt-0.5 text-[0.75rem] text-muted-foreground'>Light / Dark / システム設定に従う</p>
          </div>
          <ThemeSegment />
        </div>
      </div>
    </div>
  )
}
