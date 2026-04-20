/**
 * AppShell wraps every route with chrome:
 *   - TopBar (global, full-width): hamburger (desktop only), KotoTV
 *     wordmark, spacer, version.
 *   - Desktop (sm+): shadcn `Sidebar` on the left (240 px expanded / 48 px
 *     icon rail) starts below the TopBar. `SidebarInset` is the content
 *     column. The sidebar auto-collapses on playback routes (/live/:id
 *     and /recordings/:id) via a controlled `open` prop so the video
 *     keeps its horizontal space; Ctrl/Cmd+B still works on other routes.
 *   - Mobile: TopBar at top, `MobileTabs` (bottom fixed) at the bottom.
 *     The Sidebar's mobile path (Sheet drawer) stays mounted but never
 *     opens because the hamburger is desktop-only.
 */
import { useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar, MobileTabs } from './NavBar'
import { TopBar } from './TopBar'

interface AppShellProps {
  children: React.ReactNode
}

function isPlaybackRoute(path: string): boolean {
  return path.startsWith('/live/') || /^\/recordings\/[^/]+$/.test(path)
}

export function AppShell({ children }: AppShellProps) {
  const { location } = useRouterState()
  const playback = isPlaybackRoute(location.pathname)
  // User's sidebar preference, preserved across non-playback route changes.
  const [userOpen, setUserOpen] = useState(true)
  const open = playback ? false : userOpen

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        // Ignore programmatic opens on playback routes so the video stays
        // framed; remember the preference outside playback.
        if (!playback) setUserOpen(next)
      }}
      style={
        {
          '--sidebar-width': '240px',
          '--sidebar-width-icon': '72px'
        } as React.CSSProperties
      }
      className='flex min-h-screen flex-col bg-background text-foreground sm:h-screen sm:min-h-0'
    >
      <TopBar />
      <div className='flex flex-1 sm:min-h-0'>
        <AppSidebar />
        <SidebarInset
          id='main-content'
          className='flex flex-1 flex-col overflow-y-auto bg-background pb-[var(--mobile-nav-h)] sm:min-w-0 sm:pb-0'
        >
          {children}
        </SidebarInset>
      </div>
      <MobileTabs />
    </SidebarProvider>
  )
}
