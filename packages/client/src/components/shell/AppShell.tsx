/**
 * AppShell wraps every route with the two-tier chrome (health bar + nav bar)
 * and reserves vertical space so child content is never obscured.
 *
 * Player-mode mechanism: when the active path matches /live/:id or
 * /recordings/:id (a detail route, not the list), we set
 * `document.documentElement.dataset.mode = 'player'` which triggers the CSS
 * var swap in tech.css collapsing --shell-offset to 40px. No player routes
 * exist yet — the effect is a no-op until they are created.
 */
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { HealthBar } from './HealthBar'
import { NavBar } from './NavBar'

const PLAYER_ROUTE_RE = /^\/(live|recordings)\/[^/]+/

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { location } = useRouterState()

  useEffect(() => {
    const isPlayer = PLAYER_ROUTE_RE.test(location.pathname)
    if (isPlayer) {
      document.documentElement.dataset.mode = 'player'
    } else {
      delete document.documentElement.dataset.mode
    }
  }, [location.pathname])

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
      <main id='main-content' className='flex flex-1 flex-col overflow-y-auto pb-[var(--mobile-nav-h)] sm:pb-0'>
        {children}
      </main>
    </div>
  )
}
