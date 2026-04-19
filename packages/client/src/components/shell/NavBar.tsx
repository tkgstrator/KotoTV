/**
 * Desktop left sidebar (240 px expanded / 72 px mini on playback routes)
 * and mobile bottom tab bar. The playback routes (/live/:id and
 * /recordings/:id) auto-collapse to the 72 px mini rail so the video
 * column doesn't lose horizontal space to nav chrome.
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

function isPlaybackRoute(path: string): boolean {
  // /live/anything → playback. /recordings (list) stays expanded; only
  // /recordings/<id> (watching a specific recording) collapses.
  return path.startsWith('/live/') || /^\/recordings\/[^/]+$/.test(path)
}

export function NavBar() {
  const { location } = useRouterState()
  const path = location.pathname
  const mini = isPlaybackRoute(path)

  function isActive(to: string) {
    return to === '/' ? path === '/' : path.startsWith(to)
  }

  return (
    <>
      {/* Desktop left sidebar */}
      <nav
        aria-label='メインナビゲーション'
        className={cn(
          'hidden shrink-0 flex-col overflow-y-auto border-r border-border bg-card sm:flex',
          mini ? 'w-[72px]' : 'w-[240px]'
        )}
      >
        {/* Wordmark */}
        <div className={cn('flex h-10 shrink-0 items-center border-b border-border', mini ? 'justify-center' : 'px-3')}>
          <span className='font-mono text-[0.8125rem] font-black uppercase tracking-[0.14em] text-foreground'>
            {mini ? 'K' : 'KotoTV'}
          </span>
        </div>

        {/* Primary nav */}
        <div className='flex flex-col py-1.5'>
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              title={mini ? label : undefined}
              aria-current={isActive(to) ? 'page' : undefined}
              className={cn(
                'flex items-center whitespace-nowrap text-[0.8125rem] font-bold text-muted-foreground transition-colors',
                mini ? 'flex-col gap-0.5 py-2.5 text-[0.625rem]' : 'h-10 gap-3 px-3',
                'hover:bg-muted/20 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-[3px] focus-visible:rounded-sm',
                isActive(to) && 'bg-primary/10 text-foreground'
              )}
            >
              <Icon aria-hidden='true' className={mini ? 'size-5' : 'size-4'} />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        <div className='flex-1' />

        {/* Settings at bottom */}
        <Link
          to={SETTINGS_ITEM.to}
          title={mini ? SETTINGS_ITEM.label : undefined}
          aria-current={isActive(SETTINGS_ITEM.to) ? 'page' : undefined}
          className={cn(
            'flex items-center whitespace-nowrap border-t border-border text-[0.8125rem] font-bold text-muted-foreground transition-colors',
            mini ? 'flex-col gap-0.5 py-2.5 text-[0.625rem]' : 'h-10 gap-3 px-3',
            'hover:bg-muted/20 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
            isActive(SETTINGS_ITEM.to) && 'bg-primary/10 text-foreground'
          )}
        >
          <SETTINGS_ITEM.Icon aria-hidden='true' className={mini ? 'size-5' : 'size-4'} />
          <span>{SETTINGS_ITEM.label}</span>
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
