/**
 * AppShell wraps every route with chrome:
 *   - Desktop (sm+): left sidebar + main in a flex-row with viewport-fixed
 *     height, so the sidebar stays visible while <main> scrolls independently.
 *   - Mobile: flex-col with a top HealthBar and a bottom tab bar; <main>
 *     reserves room for the bottom bar via `pb-[var(--mobile-nav-h)]`.
 * The chrome is IDENTICAL on every route — the live player and recording
 * player do not get to hide it; they get a compact 72 px rail instead
 * (owned by NavBar).
 */
import { HealthBar } from './HealthBar'
import { NavBar } from './NavBar'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className='flex min-h-screen flex-col bg-background text-foreground sm:h-screen sm:min-h-0 sm:flex-row'>
      <HealthBar />
      <NavBar />

      {/*
       * `sm:min-w-0` prevents the flex item from exceeding the remaining
       * horizontal space when its descendants have intrinsic widths
       * (e.g. long program titles or wide EPG cells).
       */}
      <main
        id='main-content'
        className='flex flex-1 flex-col overflow-y-auto pb-[var(--mobile-nav-h)] sm:min-w-0 sm:pb-0'
      >
        {children}
      </main>
    </div>
  )
}
