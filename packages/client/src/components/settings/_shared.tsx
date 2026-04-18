import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Subsystem } from '@/hooks/useHealth'

export type SubStatus = 'ok' | 'warn' | 'err'

export function statusVariant(s: SubStatus) {
  return s satisfies 'ok' | 'warn' | 'err'
}

export const SUBSYSTEMS: { key: Subsystem; label: string }[] = [
  { key: 'mirakc', label: 'mirakc' },
  { key: 'ffmpeg', label: 'ffmpeg' },
  { key: 'postgres', label: 'postgres' },
  { key: 'tuners', label: 'tuners' }
]

/** Tailwind class shared by every ToggleGroupItem used as a segmented control. */
export const SEGMENT_ITEM_CLASS =
  'bg-muted text-muted-foreground hover:bg-background/60 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:font-semibold data-[state=on]:hover:bg-primary'

export function SectHead({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex items-center gap-2 pb-[7px] pt-[18px] font-sans text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground'>
      {children}
      <div className='h-px flex-1 bg-border' />
    </div>
  )
}

export function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-4 border-b border-border/60 px-3.5 py-3 last:border-b-0'>
      <div className='min-w-0'>
        <p className='text-[0.875rem] font-medium text-foreground'>{title}</p>
        {sub && <p className='mt-0.5 text-[0.75rem] text-muted-foreground'>{sub}</p>}
      </div>
      <div className='shrink-0'>{children}</div>
    </div>
  )
}

interface SegmentProps<T extends string> {
  ariaLabel: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}

export function Segment<T extends string>({ ariaLabel, value, options, onChange }: SegmentProps<T>) {
  return (
    <ToggleGroup
      type='single'
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={ariaLabel}
      size='sm'
      className='shrink-0'
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className={SEGMENT_ITEM_CLASS}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function fmtBytes(bytes: number): string {
  const GB = 1024 * 1024 * 1024
  const MB = 1024 * 1024
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(0)} MB`
  return `${bytes} B`
}
