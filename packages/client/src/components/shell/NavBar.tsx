/**
 * Two nav surfaces exported from one file:
 *   - `AppSidebar`: desktop left sidebar. `collapsible="icon"` keeps a
 *     72 px rail of 24 px icons visible even when collapsed, so the user
 *     always has the nav affordances. Padding is tuned so the icon
 *     column sits at 24 px from the viewport edge in both expanded and
 *     collapsed states, matching the TopBar hamburger.
 *     Items are grouped into three sections so the `録画` family
 *     (録画中 / 録画済み / エンコード / 録画予約 / 録画ルール) reads as
 *     its own cluster rather than mixing with top-level nav.
 *   - `MobileTabs`: mobile bottom tab bar (bottom-fixed). The mobile bar
 *     stays flat — grouping is desktop-only so the bottom tabs don't
 *     explode into 8 icons.
 * Active-route detection uses TanStack Router's `useRouterState`.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Archive,
  CalendarClock,
  CalendarDays,
  FileVideo,
  ListFilter,
  Radio,
  Settings as SettingsIcon,
  Tv
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
}

const MAIN_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'チャンネル', Icon: Tv },
  { to: '/epg', label: '番組表', Icon: CalendarDays }
]

const RECORDING_ITEMS: readonly NavItem[] = [
  { to: '/recordings/pending', label: '録画中', Icon: Radio },
  { to: '/recordings/completed', label: '録画済み', Icon: Archive },
  { to: '/recordings/failed', label: 'エンコード', Icon: FileVideo },
  { to: '/recordings/reservations', label: '録画予約', Icon: CalendarClock },
  { to: '/recordings/rules', label: '録画ルール', Icon: ListFilter }
]

const STATUS_ITEMS: readonly NavItem[] = [{ to: '/status', label: 'システム状態', Icon: Activity }]

const SETTINGS_ITEM: NavItem = { to: '/settings', label: '設定', Icon: SettingsIcon }

// Flat list used both for the mobile tab bar (no grouping) and for
// longest-prefix active-route detection.
const ALL_ITEMS: readonly NavItem[] = [...MAIN_ITEMS, ...RECORDING_ITEMS, ...STATUS_ITEMS, SETTINGS_ITEM]

function useIsActive() {
  const { location } = useRouterState()
  const path = location.pathname

  return (item: NavItem): boolean => {
    if (item.to === '/') return path === '/'
    const matches = (route: string) => path === route || path.startsWith(`${route}/`)
    if (!matches(item.to)) return false
    // Reject if a longer sibling path also matches — keeps a parent row
    // dark when the user is deep in one of its children.
    return !ALL_ITEMS.some(
      (other) => other !== item && other.to.length > item.to.length && other.to.startsWith(item.to) && matches(other.to)
    )
  }
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

function renderItem(item: NavItem, isActiveFn: (item: NavItem) => boolean) {
  return (
    <SidebarMenuItem key={item.to}>
      <SidebarMenuButton asChild isActive={isActiveFn(item)} className={MENU_BUTTON_CLS}>
        {/*
         * TanStack Router typechecks `to` against its route tree; items come
         * from the static NAV_ITEMS arrays, so this cast is safe at runtime.
         */}
        <Link {...({ to: item.to } as React.ComponentProps<typeof Link>)}>
          <item.Icon aria-hidden='true' />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const isActive = useIsActive()

  return (
    // top-14 + the matching height lift the fixed sidebar container below
    // the 56 px TopBar; without this override it would overlap the header.
    <Sidebar collapsible='icon' className='top-14 h-[calc(100svh-3.5rem)]! border-r-0!'>
      <SidebarContent>
        <SidebarGroup className={MENU_CONTAINER_CLS}>
          <SidebarMenu>{MAIN_ITEMS.map((item) => renderItem(item, isActive))}</SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup className={MENU_CONTAINER_CLS}>
          <SidebarMenu>{RECORDING_ITEMS.map((item) => renderItem(item, isActive))}</SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup className={MENU_CONTAINER_CLS}>
          <SidebarMenu>{STATUS_ITEMS.map((item) => renderItem(item, isActive))}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={MENU_CONTAINER_CLS}>
        <SidebarMenu>{renderItem(SETTINGS_ITEM, isActive)}</SidebarMenu>
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
      {ALL_ITEMS.map((item) => {
        const active = isActive(item)
        return (
          <Link
            key={item.to}
            {...({ to: item.to } as React.ComponentProps<typeof Link>)}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 bg-transparent text-caption font-bold text-muted-foreground no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:-outline-offset-[3px]',
              active && 'text-primary'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active && <span aria-hidden='true' className='absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary' />}
            <item.Icon aria-hidden='true' className='size-5' />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
