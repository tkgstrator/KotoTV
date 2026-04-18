/**
 * TIER-2 nav bar (40px desktop / bottom tabs mobile).
 * Active route detection uses TanStack Router's `useRouterState`.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'チャンネル', short: 'CH', route: '/' },
  { to: '/epg', label: '番組表', short: 'EPG', route: '/epg' },
  { to: '/recordings', label: '録画', short: 'REC', route: '/recordings' }
] as const

const SETTINGS_ITEM = { to: '/settings', label: '設定', short: 'CFG', route: '/settings' } as const

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
        className='sticky top-[var(--shell-health-bar-h)] z-[60] hidden h-[var(--shell-nav-bar-h)] shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden'
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent bg-transparent px-3.5 font-mono text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap transition-colors',
              'hover:bg-muted/20 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-[3px] focus-visible:rounded-sm',
              isActive(item.to) && 'border-primary text-foreground'
            )}
            aria-current={isActive(item.to) ? 'page' : undefined}
          >
            {item.label}
            <span
              className={cn(
                'font-mono text-[0.5rem] tracking-[0.05em] text-muted-foreground',
                isActive(item.to) && 'text-primary'
              )}
            >
              {item.route}
            </span>
          </Link>
        ))}

        <div className='flex-1' />

        <div className='flex items-center gap-1.5 border-l border-border px-2.5'>
          <Link
            to={SETTINGS_ITEM.to}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent bg-transparent px-2 font-mono text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap transition-colors',
              'hover:bg-muted/20 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
              isActive(SETTINGS_ITEM.to) && 'border-primary text-foreground'
            )}
            aria-current={isActive(SETTINGS_ITEM.to) ? 'page' : undefined}
          >
            {SETTINGS_ITEM.label}
            <span
              className={cn(
                'font-mono text-[0.5rem] tracking-[0.05em] text-muted-foreground',
                isActive(SETTINGS_ITEM.to) && 'text-primary'
              )}
            >
              {SETTINGS_ITEM.route}
            </span>
          </Link>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label='モバイルナビゲーション'
        className='fixed bottom-0 left-0 right-0 z-[60] flex h-[var(--mobile-nav-h)] shrink-0 border-t border-border bg-card sm:hidden'
      >
        {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 bg-transparent font-mono text-[0.5rem] font-bold uppercase tracking-[0.07em] text-muted-foreground no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:-outline-offset-[3px]',
              isActive(item.to) && 'text-primary'
            )}
            aria-current={isActive(item.to) ? 'page' : undefined}
          >
            {isActive(item.to) && (
              <span aria-hidden='true' className='absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary' />
            )}
            <span className='font-mono text-[0.625rem] font-bold'>{item.short}</span>
            <span
              className={cn('font-mono text-[0.5rem] text-muted-foreground', isActive(item.to) && 'text-primary/70')}
            >
              {item.route}
            </span>
          </Link>
        ))}
      </nav>
    </>
  )
}
