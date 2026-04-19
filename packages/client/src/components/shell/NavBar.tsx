/**
 * Single-tier chrome bar (40px desktop / bottom tabs mobile).
 * Desktop shows wordmark + Japanese nav labels + settings — HEALTH and
 * version were moved out (they live in Settings now) so the bar reads as
 * "タイトル + ナビ" only, no diagnostic chrome.
 * Active route detection uses TanStack Router's `useRouterState`.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { CalendarDays, Settings as SettingsIcon, Tv, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'チャンネル', Icon: Tv },
  { to: '/epg', label: '番組表', Icon: CalendarDays },
  { to: '/recordings', label: '録画', Icon: Video }
] as const

const SETTINGS_ITEM = { to: '/settings', label: '設定', Icon: SettingsIcon } as const

export function NavBar() {
  const { location } = useRouterState()
  const path = location.pathname

  function isActive(to: string) {
    return to === '/' ? path === '/' : path.startsWith(to)
  }

  return (
    <>
      {/* Desktop nav bar */}
      <nav
        aria-label='メインナビゲーション'
        className='sticky top-0 z-[70] hidden h-[var(--shell-nav-bar-h)] shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden'
      >
        <span className='flex h-full shrink-0 items-center border-r border-border px-3 font-mono text-[0.8125rem] font-black uppercase tracking-[0.14em] text-foreground'>
          KotoTV
        </span>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent bg-transparent px-3.5 text-[0.8125rem] font-bold text-muted-foreground whitespace-nowrap transition-colors',
              'hover:bg-muted/20 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-[3px] focus-visible:rounded-sm',
              isActive(to) && 'border-primary text-foreground'
            )}
            aria-current={isActive(to) ? 'page' : undefined}
          >
            <Icon aria-hidden='true' className='size-4' />
            {label}
          </Link>
        ))}

        <div className='flex-1' />

        <Link
          to={SETTINGS_ITEM.to}
          className={cn(
            'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-l border-transparent border-l-border bg-transparent px-3.5 text-[0.8125rem] font-bold text-muted-foreground whitespace-nowrap transition-colors',
            'hover:bg-muted/20 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
            isActive(SETTINGS_ITEM.to) && 'border-b-primary text-foreground'
          )}
          aria-current={isActive(SETTINGS_ITEM.to) ? 'page' : undefined}
        >
          <SETTINGS_ITEM.Icon aria-hidden='true' className='size-4' />
          {SETTINGS_ITEM.label}
        </Link>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label='モバイルナビゲーション'
        className='fixed bottom-0 left-0 right-0 z-[60] flex h-[var(--mobile-nav-h)] shrink-0 border-t border-border bg-card sm:hidden'
      >
        {[...NAV_ITEMS, SETTINGS_ITEM].map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 bg-transparent text-[0.6875rem] font-bold text-muted-foreground no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:-outline-offset-[3px]',
              isActive(to) && 'text-primary'
            )}
            aria-current={isActive(to) ? 'page' : undefined}
          >
            {isActive(to) && <span aria-hidden='true' className='absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary' />}
            <Icon aria-hidden='true' className='size-5' />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
