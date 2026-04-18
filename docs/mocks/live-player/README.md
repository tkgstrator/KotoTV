# Mock: Live TV Player Screen

## Goal

User taps a channel row in the channel list (`/`) and immediately sees live TV playing at `/live/$channelId`. The screen exists to get video playing as fast as possible and then stay out of the way. Controls are present for essential operations (mute, fullscreen, quality) but the design never competes with the video content for attention.

## Constraints / inputs

- Route: `/live/$channelId` (TanStack Router file-based route)
- Data available at render time: `channelId` from route params; `ServiceSchema` (channel name, type GR/BS/CS, serviceId); `ProgramSchema` (title, startAt, endAt, description) from current + next programs
- Stream lifecycle: `POST /api/streams/live/:channelId` → `{ sessionId, playlistUrl }` — can take up to 10s until `playlist.m3u8` is ready
- Must-have controls: back to channel list, mute/unmute, play/pause, fullscreen, quality picker stub (UI only — backend integration is Phase 2)
- Metadata to show: channel badge (GR/BS/CS), channel name, current program title + time range + description, progress through current program, next program(s)
- States required: loading (spinner + skeleton), error (mirakc down / transcoder failure), playing
- Remote-control / focus: every interactive element must be `:focus-visible` reachable with a visible ring; DOM order = visual order = tab order; no hover-only affordances; controls must remain accessible without a mouse

## Variants

### v1 — Overlay Controls (Immersive)

- Layout idea: Full-bleed video. Top and bottom gradient bars with controls that overlay the video. Controls could auto-hide in production (this mock keeps them visible). Desktop: video occupies left ~75%, side panel shows program info persistently at right.
- Trade-off: Maximum video real estate, cinematic feel. Auto-hide is great for mouse/touch but makes focus navigation fragile — a keyboard/remote user can lose the control bar. Mitigated in production by showing controls when any interactive element is focused. Gradient readability depends on video content (text-heavy content can fight the overlay text).

### v2 — Persistent Controls Bar (tvOS-friendly)

- Layout idea: App chrome is always visible. An explicit `<header>` bar (back + channel name + LIVE badge) stays at top. Video fills the center. A dedicated controls toolbar is permanently docked below the video — never overlapping it. Desktop: 320px side panel for program info. Mobile: controls appear between video and metadata as a separate bar.
- Trade-off: Zero reliance on hover or auto-show triggers. Tab order is completely predictable: header → video (tabIndex=0) → controls toolbar → side panel. Perfect for tvOS/FireTV D-pad navigation. Video loses a few rows of height on desktop compared to v1 — the chrome is always consuming space. This is the recommended trade-off for this app because reliability beats immersion.

### v3 — Mobile-First Minimal Split

- Layout idea: Designed for portrait phone first. Video takes full width (16:9). Below it: a single compact controls row (mute + play/pause + progress inline + quality + fullscreen), then a program info card, then a prominent "next program" card with a time-block icon. On desktop/landscape, the layout pivots to a side-by-side: video left (flex:3) + info column right (flex:2), controls bar docked below video.
- Trade-off: Cleanest portrait experience — no overlays, no gradient hackery. The "next program" card is visually prominent (time-block icon). However, the desktop version feels less dense than v1/v2 and the info column is relatively wide, shrinking the video. The flex-based responsive pivot works but requires two separate DOM subtrees for portrait/landscape hints, which the `frontend` agent needs to replace with proper responsive CSS.

## Recommendation

**v2** — Persistent Controls Bar.

Reasoning:

- "パッと入力、たまに見返す" philosophy means the user wants to *reliably* play and exit. Overlay controls that auto-hide create uncertainty — "are my controls still there?" Persistent chrome removes that anxiety.
- The tvOS/FireTV port constraint is real and non-trivial. A persistent toolbar with stable tab order is mechanical to map to a D-pad focus section. An overlay that must be "woken up" first adds a layer of state to the spatial-nav library.
- The side panel (current + next programs) being always visible means the user sees what's on next without any tap — reducing interaction to zero. That aligns with the "get out of the way" philosophy.
- v1 is more beautiful but is a worse UX for the actual usage pattern (commuting, quick check). v3's portrait layout is great but the desktop version is weaker.

## Chosen variant

_(To be filled after user selects — update this line and remove the other v*.html files if requested)_

## Handoff notes for `frontend`

### Shadcn primitives to use

| Mock element | Shadcn primitive |
|---|---|
| Back button, mute, play/pause, fullscreen | `Button` with `variant="ghost"` and `size="icon"` |
| Quality picker trigger | `Button` with `variant="outline"` + `DropdownMenu` |
| GR / BS / CS type label | `Badge` with custom color class |
| LIVE indicator | `Badge` with destructive-adjacent color |
| "まもなく終了" warning | `Badge` with `variant="outline"` in amber tone |
| Program progress bar | `Progress` (value as percentage of elapsed / total duration) |
| Loading skeletons | `Skeleton` for text lines, program titles, progress bar |
| Next programs list | `ScrollArea` wrapping a `<ul>` of program rows |
| Current program info block | `Card` / `CardHeader` / `CardContent` |
| Side panel (desktop) | `Card` with `overflow-y: auto` or `ScrollArea` |

### Tailwind tokens to use

- Video bg: `bg-zinc-950` or inline `hsl(222 30% 6%)` — always dark regardless of page theme
- App chrome / sidebar: `bg-card`, `text-card-foreground`, `border-border`
- Controls bar bg: `bg-card`
- Muted text (times, durations): `text-muted-foreground`
- Primary (progress fill, focused ring): `text-primary`, `bg-primary`, `ring-ring`
- Error state icon bg: `bg-destructive/10`, `text-destructive`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

### Interactive states to implement

- Every `Button` (ghost / icon): `hover:bg-muted`, `focus-visible:ring-2 focus-visible:ring-ring`, `active:opacity-75`
- Back link (`<Link>` wrapping an icon button): same ring rules
- Quality picker: `DropdownMenu` with `DropdownMenuTrigger` as a `Button variant="outline"` — Shadcn handles focus trap inside the menu
- Video `<video>` element: `tabIndex={0}`, Space = toggle play, M = toggle mute (keyboard shortcut wiring goes in `PlayerControls.tsx`)

### Component structure

```
/live/$channelId.tsx
  └── <LivePage>
        ├── <header> — app bar (back + channel badge + name + LIVE badge + clock)
        ├── <main style="flex:1;display:flex">
        │     ├── <section class="video-col"> — flex:1
        │     │     ├── <HlsPlayer />          — fills remaining height
        │     │     └── <PlayerControls />     — docked below video, always visible
        │     └── <aside class="side-panel">  — 320px, ScrollArea
        │           ├── <CurrentProgramCard /> — Card with Progress
        │           └── <NextProgramsList />  — ScrollArea > ul
        └── (loading overlay via conditional render, not a sibling DOM node)
```

### Responsive breakpoints

- `< 768px` (portrait phone): `flex-direction: column`, side panel becomes a stacked section below controls
- `>= 768px` (landscape / tablet / desktop): `flex-direction: row`, side panel at 320px fixed width

### `useStream` hook integration

- On mount: call `POST /api/streams/live/:channelId` → set `sessionId` in `useRef`
- While waiting for playlist: show `<LoadingState />` (spinner + skeleton side panel)
- On error (non-2xx or timeout > 10s): show `<ErrorState />` with retry button (calls the mutation again)
- On unmount: call `DELETE /api/streams/:sessionId` — use `useEffect` cleanup, not `onBeforeUnload`
- StrictMode guard: if `sessionId` ref is already set, skip the POST (idempotency)

### Open questions

- Should the quality picker show actual available qualities from the HLS manifest (`.m3u8` `#EXT-X-STREAM-INF` entries), or is it a fixed set (1080p / 720p / 480p) configured server-side? Currently stubbed as a static label.
- Auto-hide for overlay variant: if v1 is chosen later for a "theater mode" fullscreen, define the hide delay (suggested 3s) and the trigger conditions (any pointer/keyboard event resets the timer).
- Does the `<video>` element show native browser controls as a fallback (e.g. iOS Safari with `playsinline`)? Recommend `controls={false}` with custom `PlayerControls` unless `isIOS && isNativeHls` path.
- Clock in the app bar: should it tick live (`setInterval`) or be static? Probably worth animating — one `setInterval(fn, 1000)` with `useEffect` cleanup.
