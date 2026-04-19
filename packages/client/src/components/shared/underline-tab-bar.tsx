import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface UnderlineTab<T extends string> {
  value: T
  label: React.ReactNode
}

interface UnderlineTabBarProps<T extends string> {
  tabs: readonly UnderlineTab<T>[]
  value: T
  onChange: (v: T) => void
  /** Screen-reader label for the tablist (the page header already carries the title). */
  ariaLabel: string
  /** Tailwind height for the bar. Default `h-10` (40px). */
  heightClass?: string
  className?: string
}

/**
 * App-wide tab bar used for channel filters, /recordings tabs, and /settings
 * tabs. Plain `<button role="tab">` list with roving tabindex + ArrowLeft /
 * ArrowRight keyboard navigation — same shape as a Shadcn `Tabs` bar but
 * without the 60+ classes Radix + Shadcn's cva chrome emits.
 *
 * State lives in the caller so the same component serves local useState
 * (settings) and routed state (recordings ?tab=...).
 */
export function UnderlineTabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  heightClass = 'h-10',
  className
}: UnderlineTabBarProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)

  function move(delta: number, fromIdx: number) {
    const nextIdx = (fromIdx + delta + tabs.length) % tabs.length
    const next = tabs[nextIdx]
    if (!next) return
    onChange(next.value)
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
    buttons?.[nextIdx]?.focus()
  }

  function handleKey(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(1, idx)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(-1, idx)
    }
  }

  return (
    <div
      ref={listRef}
      role='tablist'
      aria-label={ariaLabel}
      className={cn('flex w-full shrink-0 border-b border-border bg-background', heightClass, className)}
    >
      {tabs.map((tab, idx) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            type='button'
            role='tab'
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => handleKey(e, idx)}
            className={cn(
              'flex-1 h-full border-b-2 -mb-px px-4 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              active
                ? 'text-foreground border-b-primary font-semibold'
                : 'text-muted-foreground border-b-transparent hover:text-foreground/80'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
