import { cn } from '@/lib/utils'

export interface SegmentedFilterTab<T extends string = string> {
  value: T
  label: string
}

interface SegmentedFilterProps<T extends string = string> {
  tabs: readonly SegmentedFilterTab<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}

export function SegmentedFilter<T extends string = string>({
  tabs,
  value,
  onChange,
  ariaLabel
}: SegmentedFilterProps<T>) {
  return (
    <div role='tablist' aria-label={ariaLabel} className='flex h-full w-full'>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type='button'
          role='tab'
          aria-selected={tab.value === value}
          className={cn(
            'relative flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80',
            tab.value === value &&
              'font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground'
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
