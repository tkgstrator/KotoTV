import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { Archive, CalendarClock, FileVideo, ListFilter, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/recordings')({
  component: RecordingsLayout
})

interface SubNavItem {
  to: string
  label: string
  Icon: LucideIcon
}

const SUB_NAV_ITEMS: readonly SubNavItem[] = [
  { to: '/recordings/pending', label: '録画中', Icon: Radio },
  { to: '/recordings/completed', label: '録画済み', Icon: Archive },
  { to: '/recordings/encoding', label: 'エンコード', Icon: FileVideo },
  { to: '/recordings/reservations', label: '予約', Icon: CalendarClock },
  { to: '/recordings/rules', label: 'ルール', Icon: ListFilter }
]

function RecordingsSubNav() {
  const { location } = useRouterState()
  const path = location.pathname

  return (
    <nav
      aria-label='録画サブナビゲーション'
      className='flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5 sm:hidden'
    >
      {SUB_NAV_ITEMS.map((item) => {
        const active = path === item.to || path.startsWith(`${item.to}/`)
        return (
          <Link
            key={item.to}
            {...({ to: item.to } as React.ComponentProps<typeof Link>)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <item.Icon aria-hidden='true' className='size-3.5' />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function RecordingsLayout() {
  return (
    <>
      <RecordingsSubNav />
      <Outlet />
    </>
  )
}
