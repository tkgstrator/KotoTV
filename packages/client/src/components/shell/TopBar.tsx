/**
 * Global top bar: sidebar trigger, KotoTV wordmark, flex spacer, version.
 * Desktop-only trigger (mobile uses the bottom tab bar for navigation, so
 * the hamburger is hidden on sm:hidden). Replaces the previous HealthBar
 * as the top chrome — health indicators now live in the Settings page.
 */
import { SidebarTrigger } from '@/components/ui/sidebar'

const APP_VERSION = 'v0.1.0'

export function TopBar() {
  return (
    <header className='flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-2'>
      <SidebarTrigger className='hidden sm:inline-flex' />
      <span className='font-mono text-[0.8125rem] font-black uppercase tracking-[0.14em] text-foreground'>KotoTV</span>
      <div className='flex-1' />
      <span className='font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground'>{APP_VERSION}</span>
    </header>
  )
}
