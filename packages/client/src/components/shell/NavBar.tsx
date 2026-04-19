/**
 * Single-tier chrome bar (40px desktop / bottom tabs mobile).
 * Desktop merges wordmark, nav tabs, settings, and the global health chip
 * into one row so watching pages don't lose ~32px to a second header.
 * Active route detection uses TanStack Router's `useRouterState`.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { StatusChip } from '@/components/shared/status-chip'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

type SubStatus = 'ok' | 'warn' | 'err'

function worstStatus(statuses: SubStatus[]): SubStatus {
  if (statuses.includes('err')) return 'err'
  if (statuses.includes('warn')) return 'warn'
  return 'ok'
}

const NAV_ITEMS = [
  { to: '/', label: 'チャンネル', short: 'CH', route: '/' },
  { to: '/epg', label: '番組表', short: 'EPG', route: '/epg' },
  { to: '/recordings', label: '録画', short: 'REC', route: '/recordings' }
] as const

const SETTINGS_ITEM = { to: '/settings', label: '設定', short: 'CFG', route: '/settings' } as const

export function NavBar() {
  const { location } = useRouterState()
  const path = location.pathname
  const { data: health } = useHealth()

  const overall: SubStatus = health
    ? worstStatus([
        health.mirakc.status,
        health.postgres.status,
        health.ffmpeg.status,
        health.tuners.status,
        health.disk.status
      ])
    : 'ok'

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
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent bg-transparent px-3.5 font-mono text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap transition-colors',
              'hover:bg-muted/20 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-[3px] focus-visible:rounded-sm',
              isActive(item.to) && 'border-primary text-foreground'
            )}
            aria-current={isActive(item.to) ? 'page' : undefined}
          >
            {item.label}
            <span
              className={cn(
                'font-mono text-[0.625rem] tracking-[0.05em] text-muted-foreground',
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
              'flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent bg-transparent px-2 font-mono text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap transition-colors',
              'hover:bg-muted/20 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm',
              isActive(SETTINGS_ITEM.to) && 'border-primary text-foreground'
            )}
            aria-current={isActive(SETTINGS_ITEM.to) ? 'page' : undefined}
          >
            {SETTINGS_ITEM.label}
            <span
              className={cn(
                'font-mono text-[0.625rem] tracking-[0.05em] text-muted-foreground',
                isActive(SETTINGS_ITEM.to) && 'text-primary'
              )}
            >
              {SETTINGS_ITEM.route}
            </span>
          </Link>
        </div>

        <div
          role='status'
          aria-label='グローバルヘルス'
          className='flex h-full shrink-0 items-center gap-2 border-l border-border px-3'
        >
          <span className='font-mono text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground'>
            health
          </span>
          <StatusChip variant={overall} size='sm'>
            {overall.toUpperCase()}
          </StatusChip>
        </div>

        <div className='flex h-full shrink-0 items-center border-l border-border/50 px-3'>
          <span className='font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground'>v0.1.0</span>
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
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 bg-transparent font-mono text-[0.625rem] font-bold uppercase tracking-[0.07em] text-muted-foreground no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:-outline-offset-[3px]',
              isActive(item.to) && 'text-primary'
            )}
            aria-current={isActive(item.to) ? 'page' : undefined}
          >
            {isActive(item.to) && (
              <span aria-hidden='true' className='absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary' />
            )}
            <span className='font-mono text-[0.75rem] font-bold'>{item.short}</span>
            <span
              className={cn('font-mono text-[0.625rem] text-muted-foreground', isActive(item.to) && 'text-primary/70')}
            >
              {item.route}
            </span>
          </Link>
        ))}
      </nav>
    </>
  )
}
