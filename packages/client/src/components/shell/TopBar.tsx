/**
 * Global top bar modeled on YouTube's masthead:
 *   - Left cluster: sidebar trigger + KotoTV wordmark (with a gap between
 *     them so the logo reads as its own unit, not a label for the button).
 *   - Center: intentionally empty (we don't have search; channel list is
 *     the discovery surface).
 *   - Right: version tag. No "create" / notifications / avatar since this
 *     app is single-user and viewer-only.
 * The hamburger is desktop-only because mobile uses the bottom tab bar
 * for navigation.
 */
import { SidebarTrigger } from '@/components/ui/sidebar'

const APP_VERSION = 'v0.1.0'

export function TopBar() {
  return (
    <header className='flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4'>
      <SidebarTrigger className='hidden size-10 sm:inline-flex' />
      <span className='font-mono text-[0.9375rem] font-black uppercase tracking-[0.14em] text-foreground'>KotoTV</span>
      <div className='flex-1' />
      <span className='font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground'>{APP_VERSION}</span>
    </header>
  )
}
