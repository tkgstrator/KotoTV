/**
 * Global top bar modeled on YouTube's masthead:
 *   - Left cluster: sidebar trigger + KotoTV wordmark (with a gap between
 *     them so the logo reads as its own unit, not a label for the button).
 *   - Center / right: intentionally empty — we don't have search, and the
 *     version has moved to /settings > About so the masthead stays quiet.
 * The hamburger is desktop-only because mobile uses the bottom tab bar
 * for navigation.
 */
import { SidebarTrigger } from '@/components/ui/sidebar'

export function TopBar() {
  return (
    <header className='flex h-14 shrink-0 items-center gap-4 bg-background px-4'>
      <SidebarTrigger className='hidden size-10 sm:inline-flex [&_svg]:size-6!' />
      <span className='text-[1.125rem] font-black tracking-tight text-foreground'>KotoTV</span>
    </header>
  )
}
