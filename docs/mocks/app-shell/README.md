# Mock: App Shell / Cross-Screen Navigation

## Goal

Define the persistent chrome that wraps every screen in KonomiTV. The shell must let users jump between channel list, EPG, recordings, and settings in ≤2 taps/clicks while disappearing entirely when the video player is full-screen.

## Constraints / inputs

- Routes: `/` (channel list), `/epg`, `/recordings`, `/recordings/$id`, `/live/$channelId`, `/settings`
- Player routes (`/live/$channelId`, `/recordings/$id`) must opt out of shell chrome.
- Shell lives in `__root.tsx` (TanStack Router root layout). Player routes use a nested layout with `<Outlet />` and no chrome wrapper.
- Future tvOS/FireTV port requires every nav item to be keyboard/D-pad focusable with visible `focus-visible` ring.
- App philosophy: "パッと入力、たまに見返す" — zero engagement loops, minimal persistent chrome.
- EPG grid is dense; any sidebar stealing horizontal width directly reduces grid columns.

## Variants

### v1 — Collapsible Sidebar (desktop) + Bottom Tab Bar (mobile)

- **Layout idea**: 240px sidebar expands to show icon+label; collapses to 56px icon-only rail via CSS checkbox toggle. Mobile: fixed 64px bottom tab bar with 4 items.
- **Trade-off**: Most horizontal real-estate stolen on desktop (240px expanded = ~17% of 1440px). Familiar SaaS pattern. Collapse recovers space but adds a mental-model step. Sidebar is the heaviest chrome option.

### v2 — Permanent 56px Icon Rail (desktop) + Horizontal Top Tab Bar (mobile)

- **Layout idea**: Icon rail is always 56px, never expands — label is tooltip-only (hover/focus). Mobile uses a scrollable horizontal tab strip at the top of the screen (below the status bar area), not the bottom.
- **Trade-off**: 56px is negligible (3.9% of 1440px). No toggle to manage. Icon-only requires tooltips on every item to satisfy spatial-nav rule 5 (no hover-only affordances — use `:hover, :focus-visible`). Mobile top tabs free up bottom of screen for content but sit close to mobile browser chrome. tvOS: icon rail is natural D-pad vertical list.

### v3 — Top Nav Bar with Text Links (desktop) + Hamburger + Overlay Drawer (mobile)

- **Layout idea**: Single 52px top bar containing wordmark + text links + right-side actions. No sidebar. Mobile: hamburger opens a full-height overlay drawer from the left.
- **Trade-off**: Loses 52px vertical height on every screen (acceptable). Top bar is familiar web pattern but conflicts with dense screens like EPG that need max vertical real-estate. Hamburger drawer on mobile is discoverable but requires 2 taps to navigate. Drawer is harder to navigate with D-pad.

### v4 — Command Palette as Primary Navigation (desktop) + Bottom Tab Bar (mobile)

- **Layout idea**: Minimal 52px top bar with only logo + a search/jump input (⌘K opens a `cmdk`-style modal). No visible nav links. Mobile uses standard bottom tab bar. Current route indicated by a pill badge in the top bar, not traditional tabs.
- **Trade-off**: Zero horizontal waste, zero vertical waste beyond the 52px bar. Power-user friendly. Requires learning ⌘K shortcut; discoverability is low for casual/new users. tvOS remote cannot open a keyboard palette naturally — would need a dedicated "navigate" button in the future port. Mobile bottom tabs make up for discoverability gap.

### v5 — 56px Icon Rail + Persistent Mini-Player Side Panel (desktop) + Bottom Tabs (mobile)

- **Layout idea**: Permanent 56px icon rail on the left. When a channel starts playing, a 280px "now playing" panel slides in from the right — shows a small 16:9 video preview, channel name, program info, and progress bar. The panel can be dismissed or expanded to full-screen `/live/$channelId`. Mobile: bottom tabs + a "再生中" tab that opens a bottom sheet mini-player.
- **Trade-off**: Enables "browse while watching" — unique differentiator. Costs 336px total (rail + panel) when panel is open, leaving only ~58% of 1440px for content. EPG grid would be significantly compressed when panel is open. Adds UX complexity: two video states (mini vs. full). Panel makes tvOS layout harder to port.

## Recommendation

**v2** — Permanent 56px icon rail (desktop) + horizontal top tab bar (mobile).

Reasons:
- 56px is the smallest reasonable chrome footprint on desktop; EPG and the channel grid lose nothing meaningful.
- No toggle state to manage — the rail is always present, always in the same place. "Predictable" is the top goal.
- Tooltip labels satisfy spatial-nav rule 5 (`:hover, :focus-visible`) and can be replaced by `Tooltip` from Shadcn without any DOM restructuring.
- The rail maps directly to a vertical D-pad focus section — the tvOS port is mechanical: register the rail as a focus section, rail items respond to up/down, Enter navigates.
- Mobile top tabs are a reasonable trade-off vs. bottom tabs: the channel list's dominant action (tap a channel row) is in the lower half of the screen anyway, so keeping nav at the top avoids thumb-collision.
- Player mode: rail and top bar simply aren't rendered — the `/live/$channelId` route uses an isolated layout with no shell.

**What v2 does not decide**: the mini-player concept from v5. That is a separate "now playing bar" feature that can be layered on later as a bottom-of-screen persistent strip (below the main content, above nothing). It does not affect the primary nav model.

## Variant that blocks other screen decisions

**v1 (expanded sidebar, 240px)** and **v5 (rail + side panel, 336px combined)** both steal horizontal width that the EPG grid needs. If either is chosen, the EPG mock must account for reduced grid width. v1 collapsed (56px) is equivalent to v2 and does not block.

**v4 (command palette)** blocks the EPG and channel-list screens from relying on top-bar breadcrumb navigation — the breadcrumb area is replaced by a pill badge. Acceptable but the EPG implementer must know there is no secondary tab row to hook into.

## Handoff notes for `frontend`

### TanStack Router structure

```
src/routes/
  __root.tsx          ← AppShell lives here (icon rail + mobile tabs)
  index.tsx           ← チャンネル一覧 (uses shell)
  epg.tsx             ← 番組表 (uses shell)
  recordings/
    index.tsx         ← 録画一覧 (uses shell)
    $id.tsx           ← 録画プレイヤー (NO shell — isolated layout)
  live/
    $channelId.tsx    ← ライブ (NO shell — isolated layout)
  settings.tsx        ← 設定 (uses shell)
```

Player routes opt out by using a separate layout file (e.g., `_player.tsx`) that renders `<Outlet />` with no chrome, while `__root.tsx` provides the shell for all other routes.

### Shadcn primitives to reach for

| Element | Shadcn primitive |
|---------|-----------------|
| Icon rail container | `<nav>` with Shadcn `cn()` utility for active state |
| Nav items | `<Button variant="ghost" size="icon">` |
| Tooltips on icon items | `<Tooltip>` + `<TooltipContent side="right">` |
| Active route highlight | `useRouterState` → compare `location.pathname` |
| Separator between nav groups | `<Separator orientation="horizontal">` |
| Mobile tab bar | Plain `<nav>` flex row; same `Button` ghost pattern |
| Focus rings | Default Shadcn `focus-visible:ring-2 focus-visible:ring-ring` — do not override |

### Tailwind tokens

- Rail background: `bg-zinc-950` dark (maps to `hsl(222 22% 7%)`) — slightly darker than `bg-card`
- Rail border: `border-r border-border`
- Active item: `bg-primary/20 text-primary`
- Active indicator stripe: `::after` pseudo-element with `bg-primary w-[3px]` on right edge
- Mobile tab bar: same `bg-zinc-950` base, `border-t border-border`

### Interactive states

All nav items must implement:
- `hover`: `bg-muted/25 text-foreground` (Shadcn ghost default)
- `focus-visible`: `ring-2 ring-ring` (never remove)
- `active` (pressed): `opacity-75`
- `aria-current="page"`: `bg-primary/20 text-primary`
- `disabled`: `opacity-40 cursor-not-allowed pointer-events-none` (if a route is unavailable)

### Not decided yet

- Whether a persistent "now playing" mini-strip (from v5 concept) appears at the bottom of the shell when a stream is active — this is a separate feature decision, not a nav-shell decision.
- Dark/light mode toggle placement — could live at the bottom of the icon rail as a final item.
- Whether the icon rail shows a notification badge on "録画" when a recording is in progress.
