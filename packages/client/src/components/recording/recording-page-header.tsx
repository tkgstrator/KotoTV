import type * as React from 'react'
import { PageHeader } from '@/components/shell/PageHeader'

export interface RecordingHeaderStat {
  label: string
  value: number | string
  /** Tint the value e.g. for amber / destructive states. */
  tone?: 'default' | 'primary' | 'amber' | 'destructive'
}

interface Props {
  ariaLabel: string
  /** Left-aligned stat pills, e.g. `{ label: '録画中', value: 2 }`. */
  stats?: readonly RecordingHeaderStat[]
  /** Right-aligned action slot — typically a primary button. */
  action?: React.ReactNode
}

const TONE_CLASSES: Record<NonNullable<RecordingHeaderStat['tone']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  amber: 'text-amber-500',
  destructive: 'text-destructive'
}

/**
 * Shared sub-page header for every `/recordings/*` screen. The sidebar
 * already tells the user which page they're on, so we skip a title and
 * keep the header as a thin 48px strip that surfaces the two useful
 * things each page has: a count/summary on the left and the primary
 * action on the right.
 */
export function RecordingPageHeader({ ariaLabel, stats, action }: Props) {
  return (
    <PageHeader ariaLabel={ariaLabel} className='items-center gap-4 pl-4 pr-3'>
      <div className='flex min-w-0 items-center gap-4 text-footnote text-muted-foreground'>
        {stats?.map((s) => (
          <span key={s.label} className='shrink-0'>
            {s.label}{' '}
            <span className={`font-semibold tabular-nums ${TONE_CLASSES[s.tone ?? 'default']}`}>{s.value}</span>
          </span>
        ))}
      </div>
      <div className='flex-1' />
      {action && <div className='flex shrink-0 items-center'>{action}</div>}
    </PageHeader>
  )
}
