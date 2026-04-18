# Mock: App Shell / Cross-Screen Navigation

## Goal

Define the persistent chrome that wraps every screen in KonomiTV. The shell must let users jump between channel list, EPG, recordings, and settings in 2 taps/clicks or less, surface subsystem health at a glance, and disappear almost entirely when the video player is active.

## Constraints / inputs

- Routes: `/` (channel list), `/epg`, `/recordings`, `/recordings/$id`, `/live/$channelId`, `/settings`
- Player routes (`/live/$channelId`, `/recordings/$id`) must reduce chrome to a single back-chevron + session chip bar.
- Shell lives in `__root.tsx` (TanStack Router root layout). Player routes use a nested layout with `<Outlet />` and no chrome wrapper.
- Future tvOS/FireTV port requires every nav item to be keyboard/D-pad focusable with visible `focus-visible` ring.
- App philosophy: "パッと入力、たまに見返す" — zero engagement loops.
- EPG grid is dense; any sidebar stealing horizontal width directly reduces grid columns.
- Status chip grammar: `OK` / `WARN` / `ERR` / `FATAL` / `BUF` / `LIVE` / `REC` / `SCHED` — monospace, square corners, border-based coloring.

---

## Legacy direction (v1–v5) — deprecated 2026-04-17

These variants were designed before the diagnostic-dense visual register was established. They are consumer-streaming-app patterns (pill backgrounds, brand-forward, no subsystem health in the shell). Designer recommended v2 (56px icon rail), but it was never adopted for implementation. The new v10+ family supersedes all of them. Do not delete these files.

---

## Current direction (v10+) — diagnostic-dense family

All v10+ variants share:
- Status chip vocabulary from `states/v3`: monospace, square corners (`border-radius: 2px`), border-based coloring, 9px font.
- `--success` / `--warning` / `--destructive` CSS vars for chip semantics.
- Focus rings: `outline: 2px solid hsl(var(--ring))` with 2–3px offset. Never removed.
- No pure `#000` / `#fff`. All colors via CSS custom properties.
- Subsystem health always visible in the shell (mirakc / postgres / ffmpeg).
- Queue awareness chip (`REC N · SCHED N`) always visible.
- Player-mode reduction: both navigation bars collapse to a single 40px session chip bar.
- 56px icon rail on desktop; responsive mobile alternative per variant.

---

## Variants

### v10 — Top Toolbar + Full-Width Health Strip + 56px Icon Rail

- **Health placement**: Two-tier — 44px top toolbar holds global `OK/WARN/ERR` chip + queue chip, then a 28px health strip with per-subsystem cells directly below.
- **Nav axis**: Desktop 56px icon rail (left); mobile bottom tab bar (fixed).
- **Label strategy**: Icon + 4-letter monospace label (`CH`, `EPG`, `REC`, `CFG`).
- **Player-mode reduction**: Top toolbar + health strip hidden; icon rail hidden; single player chip bar at top.
- **Trade-off**: Two-tier chrome costs 72px vertical. Clear separation of concerns (toolbar = global, strip = subsystem). Strip is scrollable on narrow viewports. Faithful to `settings/v12` health strip pattern.

### v11 — Left Sidebar with Embedded Health Panel + Mobile Drawer (mobile-first)

- **Health placement**: Top anchor inside the 200px sidebar — subsystem rows + queue summary in a dedicated panel. On mobile: compact `OK/WARN` chip in the top app bar + scrollable health row in the app bar's second line.
- **Nav axis**: Desktop 200px sidebar (not collapsible — always open); mobile hamburger-triggered Sheet drawer.
- **Label strategy**: Icon + full Japanese label inside sidebar. System font for readability.
- **Player-mode reduction**: Sidebar hidden entirely; session chip bar replaces app bar.
- **Trade-off**: 200px sidebar costs ~14% of 1440px viewport — EPG grid loses meaningful width. Health panel is richest of all variants (room for queue breakdown). Drawer is familiar on mobile. Sidebar is the hardest to adapt for tvOS D-pad (needs separate focus section registration).

### v12 — Full-Width 32px Health Bar (Control Panel) + Monospace-Only Text Nav

- **Health placement**: Single 32px global bar pinned topmost — wordmark cell + per-subsystem cells + queue + version. Everything monospace. No icons.
- **Nav axis**: 40px nav bar below the health bar; text-only links with route-path suffix (`チャンネル /`). Mobile: bottom tab bar with route-path sub-label.
- **Label strategy**: No icons at all on desktop nav. Route paths visible at all times (`/epg`, `/recordings`). Most "technical artifact" feel.
- **Player-mode reduction**: Both bars collapse to a single 40px session chip bar. Most dramatic reduction.
- **Trade-off**: Zero icon rail — no horizontal budget consumed. Nav consumes 72px total vertically (32 + 40). Route-path labels are developer-legible but may confuse non-technical users. Monospace-only is the most consistent with the diagnostic register. Mobile nav bar replaced by bottom tabs for usability. ERR state adds a red border to the health bar.

### v13 — Compact 36px Top Bar with Route Breadcrumb + 56px Rail + Rail Health Dots

- **Health placement**: Compact per-subsystem cells in the 36px top bar (visible on desktop, hidden on mobile for space). Rail bottom anchors 3 single-pixel dots (green/amber/red) per subsystem — tooltip on hover/focus.
- **Nav axis**: Desktop 56px icon rail; mobile bottom tab bar.
- **Label strategy**: Icon + short label in rail. Top bar shows active route as a `→ /route` breadcrumb chip.
- **Player-mode reduction**: Top bar + rail both hidden; session chip bar replaces them.
- **Trade-off**: Smallest total vertical chrome (36px only). Health dots in rail are ultra-minimal — information density is low until hovered. Route breadcrumb is a nice cross-screen indicator. Best for users who want maximum content area. tvOS: rail maps cleanly to D-pad vertical list. Dots require hover to understand, which is a mild WCAG concern (mitigated by `focus-visible` tooltip on each dot).

### v14 — Mobile-First: Bottom Tabs + Collapsible Health Strip (WARN auto-expands)

- **Health placement**: Compact `OK/WARN/ERR` chip in 40px top bar always visible. Below: a 24px summary row (scrollable chips) that collapses/expands to a detail row. Auto-expands when health != OK — the "alert pull" idiom.
- **Nav axis**: Mobile bottom tabs (58px, fixed) always shown. Desktop additionally shows 56px icon rail.
- **Label strategy**: Icon + monospace label in tabs/rail.
- **Player-mode reduction**: App bar + health strip hidden; session chip bar at top; bottom tabs remain (link back to live listing).
- **Trade-off**: Collapsible strip is a novel interaction — zero vertical cost when OK (health is a chip in top bar only), full detail on demand or on WARN. Best for the "パッと入力" philosophy: health is unobtrusive until it needs attention. Mobile bottom tabs are the most thumb-friendly primary nav. Desktop gets the same bottom tabs removed + icon rail added. Strip collapse animation needs to be handled carefully in React (use `max-height` transition).

---

## Recommendation

**v12** — Full-Width 32px Health Bar + Monospace-Only Text Nav.

Reasons:
- The health bar is the most consistent with the stated design direction ("the brand is the status chip strip"). Every other app has a logo-forward toolbar; v12 makes the subsystem health bar the first thing you see — literally the wordmark is inside the health bar.
- Zero horizontal budget consumed (no sidebar, no icon rail). EPG grid and channel list get full viewport width on desktop.
- Route-path labels in the nav bar (`チャンネル /`, `番組表 /epg`) are genuinely useful in a technical app — power users orient by path, not by icon.
- Player-mode reduction is the cleanest: both bars (32 + 40 = 72px) collapse to a single 40px session chip bar — the most dramatic, most honest reduction.
- Monospace throughout is the most internally consistent with `states/v3`, `settings/v12`, `live-player/v10`, `recordings/v10`.
- The ERR/WARN border on the health bar is a low-cost, high-signal alert — no modal, no toast.
- Mobile: bottom tabs + a single-line health summary bar above content keep the phone layout clean without losing any health signal.

**What v12 does not decide**: whether a persistent mini-player strip appears at the bottom of the shell when a stream is active away from `/live/$channelId`. That is a separate feature (the v5 concept). It can be layered on v12 as a 48px strip above the mobile tabs without affecting the nav model.

**Why not v14**: the collapsible strip is clever but adds an interaction that can hide important health signals. When WARN fires at 2am, the strip auto-expanding is correct — but it is extra complexity in the React component for a marginal gain over v12's always-visible bar.

**Why not v13**: the health dots are too minimal. Three colored pixels give no semantic information without hover/focus — a WCAG concern and a tvOS problem (D-pad cannot hover).

**Why not v11**: the 200px sidebar consumes too much horizontal space and blocks EPG density.

---

## Handoff notes for `frontend`

### TanStack Router structure

```
src/routes/
  __root.tsx             ← AppShell lives here (health bar + nav bar + mobile tabs)
  index.tsx              ← チャンネル一覧 (uses shell)
  epg.tsx                ← 番組表 (uses shell)
  recordings/
    index.tsx            ← 録画一覧 (uses shell)
    $id.tsx              ← 録画プレイヤー — uses _player.tsx layout, NO full shell
  live/
    $channelId.tsx       ← ライブ — uses _player.tsx layout, NO full shell
  _player.tsx            ← Player layout: renders only <PlayerShellBar> + <Outlet />
  settings.tsx           ← 設定 (uses shell)
```

Player routes opt out via `_player.tsx` layout. `__root.tsx` renders the full shell via a route-based conditional:

```tsx
// __root.tsx approach
const isPlayer = location.pathname.startsWith('/live/') || 
                 location.pathname.match(/^\/recordings\/\d+/);
return isPlayer ? <PlayerShell /> : <AppShell />;
```

Or preferably the nested layout file approach (`_player.tsx`) so the shell is never even mounted for player routes.

### Health signal sources

- `GET /api/health` — returns `{ mirakc, postgres, ffmpeg, tuners }` each with `{ status: 'ok'|'warn'|'err', detail: string }`. Poll interval: 15s. Share the result via TanStack Query with key `['health']`. Both the shell AND `settings/status` tab consume the same query — no duplication.
- Global chip in health bar = `max(mirakc.status, postgres.status, ffmpeg.status)` by severity.
- When chip is `WARN` or `ERR`, make it an `<a href="/settings?tab=status">` link.

### Queue count source

- `GET /api/recordings?status=recording,scheduled` — filter by status. Count chip = `REC ${recording.length} · SCHED ${scheduled.length}`. TanStack Query key `['recordings', { status: ['recording', 'scheduled'] }]`. Poll interval: 30s or invalidate on mutation.

### Shadcn primitive mapping

| Element | Shadcn primitive |
|---------|-----------------|
| Health bar container | `<div>` with sticky + CSS vars (no Shadcn equiv) |
| Nav links | `<NavigationMenu>` or plain `<Button variant="ghost">` |
| Active route chip / breadcrumb | `<Badge variant="outline">` with primary color override |
| Queue badge | `<Badge>` with destructive variant |
| Mobile tabs | `<nav>` with `Button variant="ghost"` items |
| Sheet drawer (if v11 chosen) | Shadcn `<Sheet>` |
| Tooltip on dots (if v13 chosen) | Shadcn `<Tooltip>` + `<TooltipContent side="right">` |
| Separator | `<Separator orientation="vertical">` for cell dividers |

### StatusChip — shared component recommendation

**Yes, extract `<StatusChip>` as a shared component.** It is used identically in:
- App shell health bar (subsystem cells)
- EPG now-strip (program status)
- Live player diagnostic sidebar
- Recordings list (REC / SCHED / FAIL / DONE)
- Settings status tab

Proposed API:

```tsx
type StatusVariant = 'ok' | 'warn' | 'err' | 'fatal' | 'live' | 'rec' | 'sched' | 'done' | 'info' | 'muted' | 'buf';

interface StatusChipProps {
  variant: StatusVariant;
  children: React.ReactNode;
  dot?: boolean;       // animated pulse dot prefix (for LIVE)
  asLink?: string;     // if set, renders as <a href={asLink}>
  className?: string;
}
```

Location: `packages/client/src/components/ui/status-chip.tsx`. Import it everywhere status is displayed. The CSS is 15 lines; centralizing it prevents the 6-screen drift that has already started between the mocks.

### Interactive states for nav items

- `hover`: `bg-muted/20 text-foreground`
- `focus-visible`: `outline-2 outline-ring outline-offset-[-3px]`
- `active` (pressed): `opacity-75`
- `aria-current="page"`: primary color text + bottom-border stripe (2px `bg-primary`)
- `disabled`: `opacity-40 cursor-not-allowed pointer-events-none`

### Cross-screen concerns

- **Health strip vs. settings**: not duplication — shell shows a summary reduction (single chip or 3-cell row), settings/status tab shows the full diagnostic table. They share one TanStack Query call.
- **v11 sidebar width (200px)**: would squeeze EPG grid below its minimum target density on 1280px viewports. If v11 is chosen, EPG mock must be revisited.
- **v12 nav bar consumes 72px vertical**: health bar (32px) + nav bar (40px). On 800px height viewports this is 9% overhead. Acceptable given the content areas (channel list, recordings) scroll; EPG is the only full-viewport-height screen and it has its own sticky header logic.
- **`<StatusChip>` extraction**: do this before implementing any screen. Every screen mock uses the same chip CSS; a late extraction causes 5–6 simultaneous file edits.

### Not decided yet

- Dark/light mode toggle placement (bottom of icon rail? settings only?).
- Persistent mini-player strip when stream active outside `/live/$channelId` (v5 concept).
- Whether `⌘K` command palette is implemented in Phase 2 or later.
- Version chip (`v0.9.1`) placement — health bar right side is shown in mocks; could be settings-only.
