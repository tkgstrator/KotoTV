/**
 * AppShell wraps every route with chrome (single-tier nav bar on desktop,
 * top health bar + bottom tabs on mobile) and reserves vertical space so
 * child content is never obscured. The chrome is IDENTICAL on every route —
 * the live player and recording player do not get to shrink it. That keeps
 * layout gaps out of navigation transitions and keeps diagnostic info
 * visible while watching.
 */
import { HealthBar } from './HealthBar'
import { NavBar } from './NavBar'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className='flex min-h-screen flex-col bg-background text-foreground'>
      <HealthBar />
      <NavBar />

      {/*
       * padding-top lifts content clear of the fixed-height shell chrome.
       * On mobile, padding-bottom reserves space for the bottom tab bar.
       * The TypeFilter's `sticky top-0` is still correct because it sticks
       * within this scrollable content area, not relative to the viewport.
       */}
      {/*
       * Capped at 1784 px and centered so ultra-wide monitors don't
       * stretch content to infinity. Matches YouTube's watch-page
       * max-width so the live player's proportions feel familiar.
       * Individual pages that want to escape the cap (EPG's scrolling
       * timeline grid, for instance) can wrap their own content with
       * `w-screen -ml-[calc((100vw-100%)/2)]` or similar.
       */}
      <main
        id='main-content'
        className='mx-auto flex w-full max-w-[1784px] flex-1 flex-col overflow-y-auto pb-[var(--mobile-nav-h)] sm:pb-0'
      >
        {children}
      </main>
    </div>
  )
}
