/**
 * StatusChip — shared presentational primitive used across EPG, live player,
 * recordings, settings health panel, and app-shell. Extracted before any
 * screen implementation to avoid simultaneous edits in 5–6 files.
 *
 * Lives in `components/shared/` because `components/ui/` is reserved for
 * Shadcn-generated primitives (single-source, local variants only). Shared
 * app primitives that encode product-level vocabulary go here.
 *
 * See: docs/mocks/app-shell/README.md §StatusChip
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export type StatusVariant =
  | 'ok'
  | 'warn'
  | 'err'
  | 'fatal'
  | 'live'
  | 'rec'
  | 'sched'
  | 'done'
  | 'info'
  | 'muted'
  | 'buf'

const chipVariants = cva(
  'inline-flex items-center rounded-status border font-mono font-bold uppercase tracking-status',
  {
    variants: {
      variant: {
        ok: 'bg-success/12 border-success/35 text-success',
        warn: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
        err: 'bg-destructive/12 border-destructive/35 text-destructive',
        fatal: 'bg-destructive border-destructive text-destructive-foreground',
        live: 'bg-destructive/12 border-destructive/35 text-destructive',
        rec: 'bg-destructive/12 border-destructive/35 text-destructive',
        sched: 'bg-muted border-border text-muted-foreground',
        done: 'bg-primary/12 border-primary/35 text-primary',
        info: 'bg-primary/12 border-primary/35 text-primary',
        buf: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
        muted: 'bg-muted border-border text-muted-foreground'
      },
      size: {
        default: 'gap-1 px-1.5 py-0.5 text-status',
        sm: 'gap-[3px] px-1 py-[1px] text-[0.5625rem] leading-none'
      }
    },
    defaultVariants: { variant: 'info', size: 'default' }
  }
)

const PULSE_VARIANTS: StatusVariant[] = ['live', 'rec']

export interface StatusChipProps extends VariantProps<typeof chipVariants> {
  variant: StatusVariant
  children: React.ReactNode
  dot?: boolean
  asLink?: string
  className?: string
  size?: 'default' | 'sm'
}

export function StatusChip({ variant, children, dot, asLink, className, size }: StatusChipProps) {
  const shouldPulse = dot && PULSE_VARIANTS.includes(variant)

  const dotSize = size === 'sm' ? 'size-1' : 'size-1.5'
  const dotEl = dot ? (
    <span
      aria-hidden='true'
      className={cn(dotSize, 'rounded-full bg-current flex-shrink-0', shouldPulse && 'animate-pulse')}
    />
  ) : null

  const inner = (
    <>
      {dotEl}
      {children}
    </>
  )

  const classes = cn(chipVariants({ variant, size }), className)

  if (asLink) {
    return (
      <a
        href={asLink}
        className={cn(
          classes,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1'
        )}
      >
        {inner}
      </a>
    )
  }

  return <span className={classes}>{inner}</span>
}
