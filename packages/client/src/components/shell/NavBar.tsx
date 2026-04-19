/**
 * Two nav surfaces exported from one file:
 *   - `AppSidebar`: desktop left sidebar, rendered inside `SidebarProvider`.
 *     Collapses to 48 px "icon" mode automatically on playback routes
 *     (handled in AppShell via controlled `open` prop).
 *   - `MobileTabs`: mobile bottom tab bar (bottom-fixed), unchanged.
 * Active-route detection uses TanStack Router's `useRouterState`.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { CalendarDays, Settings as SettingsIcon, Tv, Video } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'チャンネル', Icon: Tv },
  { to: '/epg', label: '番組表', Icon: CalendarDays },
  { to: '/recordings', label: '録画', Icon: Video }
] as const

const SETTINGS_ITEM = { to: '/settings', label: '設定', Icon: SettingsIcon } as const

function useIsActive() {
  const { location } = useRouterState()
  const path = location.pathname
  return (to: string) => (to === '/' ? path === '/' : path.startsWith(to))
}

export function AppSidebar() {
  const isActive = useIsActive()

  return (
    // top-10 + the matching height lift the fixed sidebar container below
    // the 40 px TopBar; without this override it would overlap the header.
    <Sidebar collapsible='icon' className='top-10 !h-[calc(100svh-2.5rem)]'>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={isActive(to)} tooltip={label}>
                  <Link to={to}>
                    <Icon aria-hidden='true' />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive(SETTINGS_ITEM.to)} tooltip={SETTINGS_ITEM.label}>
              <Link to={SETTINGS_ITEM.to}>
                <SETTINGS_ITEM.Icon aria-hidden='true' />
                <span>{SETTINGS_ITEM.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export function MobileTabs() {
  const isActive = useIsActive()

  return (
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
  )
}
