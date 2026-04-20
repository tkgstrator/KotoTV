/**
 * Two nav surfaces exported from one file:
 *   - `AppSidebar`: desktop left sidebar. `collapsible="icon"` keeps a
 *     72 px rail of 24 px icons visible even when collapsed, so the user
 *     always has the nav affordances. Padding is tuned so the icon
 *     column sits at 24 px from the viewport edge in both expanded and
 *     collapsed states, matching the TopBar hamburger.
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

// Row class applied to every SidebarMenuButton so icons are 24 px and the
// button is tall enough to fit them with matching vertical padding, in
// both expanded and icon-only modes. Shadcn forces `size-8 p-2` in icon
// mode with `!`, so we override with our own `!size-10 !p-2` to hold the
// 24 px icon without clipping. `gap-6` (24 px) between icon and label
// matches the visual gap in the TopBar: 8 px of post-icon button padding
// + 16 px of `gap-4` between the hamburger and KotoTV = 24 px.
const MENU_BUTTON_CLS =
  'h-10 gap-6 [&>svg]:size-6 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2!'

// SidebarGroup/Footer override: `px-4` lines the icon column up with the
// TopBar hamburger and centers the 40 px button inside the 72 px icon
// rail. Math:
//   TopBar icon left = viewport-px-4 (16) + (size-10 button - size-6 icon) / 2 (8) = 24 px
//   Sidebar icon left (expanded) = sidebar-px-4 (16) + button-p-2 (8) = 24 px
//   Sidebar icon left (icon rail) = sidebar-px-4 (16) + button-p-2 (8) = 24 px
const MENU_CONTAINER_CLS = 'px-4'

export function AppSidebar() {
  const isActive = useIsActive()

  return (
    // top-14 + the matching height lift the fixed sidebar container below
    // the 56 px TopBar; without this override it would overlap the header.
    <Sidebar collapsible='icon' className='top-14 h-[calc(100svh-3.5rem)]!'>
      <SidebarContent>
        <SidebarGroup className={MENU_CONTAINER_CLS}>
          <SidebarMenu>
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={isActive(to)} className={MENU_BUTTON_CLS}>
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
      <SidebarFooter className={MENU_CONTAINER_CLS}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive(SETTINGS_ITEM.to)} className={MENU_BUTTON_CLS}>
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
