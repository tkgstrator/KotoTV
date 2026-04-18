/**
 * PageHeader — every route's top chrome slot. Height is controlled by the
 * active theme (`--page-header-h`); content is page-specific. Sticks to the
 * top of the scrollable main area so it stays visible while the body scrolls.
 *
 * Usage:
 *   <PageHeader>
 *     <TypeFilter ... />
 *   </PageHeader>
 *
 * The shell's HealthBar + NavBar sit above the main scroll container, so
 * `sticky top-0` here pins the header to the top of the content area below
 * the shell chrome.
 */
import type * as React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  children: React.ReactNode
  className?: string
  ariaLabel?: string
}

export function PageHeader({ children, className, ariaLabel }: PageHeaderProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn('sticky top-0 z-20 flex h-page-header shrink-0 border-b border-border bg-background', className)}
    >
      {children}
    </section>
  )
}
