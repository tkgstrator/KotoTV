# Mock: EPG 番組表

## Goal

User opens `/epg` to quickly scan what is on right now and what is coming up. Primary actions are: jump to live video for a channel, and reserve (record) a future program. Session is brief — "glance and leave" — never "browse for 20 minutes".

## Constraints / inputs

- Route: `/epg?at=<ISO>&channel=<id?>`
- Data schema (`Channel.dto.ts`): `MirakcProgramSchema` — `id`, `serviceId`, `startAt` (ms epoch), `duration` (ms), `name?`, `description?`, `genres[]` (lv1/lv2 ARIB codes)
- `ChannelSchema` — `id`, `type` (GR/BS/CS/SKY), `serviceId`, `networkId`, `name`, `channelNumber`, `currentProgram`, `nextProgram`
- Must-have controls: channel-type filter (GR/BS/CS), date navigation (prev/next day), "jump to now", program cell → watch live, program cell → reserve recording
- Now-line indicator (auto-updates every 60 s via `setInterval`)
- Virtualization: `@tanstack/react-virtual` (2-axis for grid variants, 1-axis for list variants)
- Spatial-nav forward-compat: every interactive element tabindex-reachable; DOM order = visual order; focus rings on all cells; no hover-only affordances
- Performance: mirakc returns full day per request; frontend paginates in 6-hour windows

## Genre colour system

| Genre (ARIB lv1) | Token | Hue |
|---|---|---|
| 0x0 ニュース/報道 | `g-news` | blue 221 83% 55% |
| 0x1 スポーツ | `g-sports` | green 142 70% 42% |
| 0x2 情報/ワイドショー | `g-variety` | amber 38 92% 48% |
| 0x3 ドラマ | `g-drama` | purple 280 60% 52% |
| 0x4 音楽 | `g-music` | violet 260 60% 50% |
| 0x5 バラエティ | `g-variety` | (same as 0x2) |
| 0x6 映画 | `g-movie` | orange 15 80% 48% |
| 0x7 アニメ/特撮 | `g-anime` | pink 320 70% 52% |
| 0x8 ドキュメンタリー/教養 | `g-docu` | teal 190 70% 42% |
| 0x9 劇場/公演 | `g-drama` | (same as ドラマ) |
| 0xA 趣味/教育 | `g-edu` | lime 100 55% 42% |
| 0xF その他 | `g-other` | slate 215 12% 48% |

All genre colours are CSS custom property `--g`, applied as `hsl(var(--g))`. Cells use `background: hsl(var(--g) / 0.15)` + `border-left: 3px solid hsl(var(--g))`.

## Now-line indicator

A `2px` vertical (horizontal-time grid) or horizontal (vertical-time / carousel) line in `hsl(var(--destructive))` with a `8px` circle cap. Positioned via `left: calc(ch-label-width + minutes-from-midnight * px-per-minute)`. Updated via `useEffect` + `setInterval(60_000)`.

---

## Variants

### v1 — Horizontal time axis (TV Guide grid) — existing
- Layout: channels as rows (sticky left label), time flows right, 3px/min = 180px/hr. Standard western TV Guide.
- Trade-off: familiar to Japanese broadcast viewers; wide horizontal scroll needed; mobile requires touch pan; 2-axis virtualization complexity is high.
- Coverage: desktop full-day grid. Dark mode only.

### v2 — Vertical time axis (NHK timetable style) — existing
- Layout: channels as columns (sticky top header), time flows downward. Matches NHK Plus / Tver web style.
- Trade-off: natural vertical scroll for time; horizontal scroll for more channels; easier single-column virtualization; harder to see a full day at a glance on desktop.
- Coverage: desktop grid. Dark mode only.

### v3 — Agenda / Now+Next list (no grid)
- Layout: one collapsible section per channel; each section lists ON AIR → NEXT → later programs as linear rows with time column + genre bar + progress bar on the live item. Desktop auto-columns (2–3 col CSS grid).
- Trade-off: zero grid complexity; works perfectly on mobile; no cross-channel time comparison possible; virtualization is trivial (1-axis flat list); very fast to render; "glance and leave" optimized. Loses the ability to spot "what's on at 22:00 on all channels simultaneously".

### v4 — Split: pinned NOW-strip + scrollable future grid
- Layout: top section = horizontally-scrollable card strip of currently airing programs (one card per channel, shows progress bar + watch CTA); bottom section = horizontal-time grid starting from next half-hour.
- Trade-off: best of both worlds for quick access to current programs; adds complexity of two independent scroll areas; "now" is instantly visible without any scroll; future schedule is compact. Slightly higher implementation cost.

### v5 — Mobile-native: single-channel + channel hopper
- Layout: pill strip at top to select active channel; hero ON AIR card with large progress bar + watch CTA; vertical list of upcoming programs below; past programs dimmed at bottom. Desktop shows the phone-frame on left.
- Trade-off: cleanest mobile UX; no cognitive load from grid scanning; but cannot compare channels — user must hop. Best when user knows which channel they want. Not a replacement for a grid on desktop.

### v6 — Dense magazine grid + side-drawer detail panel
- Layout: time as rows (30-min slots), channels as columns (opposite axis from v1/v2); very compact 26px row height; selected cell opens inline side drawer (280px) with full description + reserve/watch buttons.
- Trade-off: highest information density; 8+ channels visible simultaneously; drawer avoids modal focus traps; on mobile the drawer becomes a bottom sheet. Complex virtualization (both axes). Closest to a print TV listing. Demands wide viewport to be useful.

### v7 — Per-channel vertical carousel (column-per-channel, horizontal swipe)
- Layout: each channel is a self-contained vertical strip (time flows top→bottom); strips are laid horizontally in a scrollable carousel (scroll-snap). NOW-line as a horizontal rule inside each strip; program blocks sized proportionally (1px/min in the mock, configurable).
- Trade-off: excellent for tvOS/FireTV remote navigation (left/right = channel, up/down = time); natural vertical time axis; hard to compare programs across channels on the same row; mobile-friendly swipe. Scroll-snap makes focus management predictable.

### v8 — Responsive hybrid (same file, media-query split)
- Layout: below 768px = agenda list (v3 style, ON AIR badge + time col + reserve btn); above 768px = horizontal-time grid (v1 style, channels as rows, now-line). One page, no separate mobile route.
- Trade-off: single route handles both; no duplicate data fetching; the two layouts have very different DOM structures so React renders one tree and conditionally shows it — virtualization strategy differs per breakpoint. Cleanest production approach if we must ship one route.

---

## Recommendation

**v8** — Responsive hybrid.

Reasons:

1. The app has one `/epg` route. Shipping a separate mobile route would split the data layer. A single route with `useMediaQuery` or CSS breakpoints is cleaner.
2. The mobile agenda (v3 pattern) is genuinely the best small-screen EPG: zero scroll complexity, instant visual access to ON AIR items, progress bars, no tiny tap targets.
3. The desktop grid (v1 / v8 desktop branch) is what power users expect: cross-channel time comparison is only possible here.
4. The now-line + sticky headers work identically in both branches.
5. `@tanstack/react-virtual` strategy: on mobile use a flat `useVirtualizer` (rows = channels, each row renders 2–4 program items); on desktop use a 2-axis virtualizer.

Secondary pick: **v4** (split NOW-strip + future grid) if the team wants a visually more distinctive desktop design. The NOW-strip is a strong first-screen differentiator.

**Do not use v5 or v7 as the primary EPG** — they are channel-at-a-time views, not a full guide. They could be promoted as supplementary "channel detail" screens reachable from the EPG.

**v6 is tempting** for dense information display but the opposite axis from v1/v2 confuses users who learned one mental model. Reserve it as a future "compact mode" toggle.

---

## Handoff notes for `frontend`

### Shadcn primitives to use

| UI element | Shadcn primitive |
|---|---|
| Program detail overlay (desktop) | `Sheet` (side) or `Drawer` (bottom on mobile) |
| Channel type filter | `Tabs` or `ToggleGroup` |
| Date navigation buttons | `Button` variant="outline" |
| Reserve/Watch action buttons | `Button` variant="default" / "destructive" |
| Loading skeleton | `Skeleton` |
| Error retry | `Alert` + `Button` |
| Genre legend pills | `Badge` |
| Now indicator dot (blinking) | CSS animation, no Shadcn needed |
| Scrollable grid | `ScrollArea` (wraps both axes) |

### Tailwind tokens

- `bg-background` — EPG scroll area background
- `bg-card` — sticky channel label + time ruler + app bar
- `text-foreground` — program title
- `text-muted-foreground` — time range, genre label, channel number secondary
- `border-border` — grid lines (use at 40% opacity for inner cell borders)
- `hsl(var(--primary))` — watch CTA, selected tab
- `hsl(var(--destructive))` — now-line, reserve CTA, ON AIR badge
- `ring` — focus-visible outline (2px, offset -2px for grid cells, +2px for buttons)

### Interactive states required in implementation

- `hover` — `filter: brightness(1.07)` on program cell; `bg-muted/50` on channel label
- `focus-visible` — `outline: 2px solid ring; outline-offset: -2px` inside grid cells; `+2px` for buttons
- `aria-current="true"` — on the currently-airing cell (also apply `on-air` style class)
- `pressed / active` — `opacity-75` on cell click
- `disabled` — past programs: `opacity-50`, no hover effect, still focusable with reduced affordance

### Virtualization strategy

```
// Mobile (agenda):
const rowVirtualizer = useVirtualizer({
  count: channels.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (i) => estimateChannelRowHeight(channels[i]), // ~40 + programs.length * 56
  overscan: 3,
})

// Desktop (2-axis grid):
const rowVirtualizer = useVirtualizer({ count: channels.length, estimateSize: () => 54 })
// columns are fixed-width (time columns 200px), no column virtualizer needed initially
// Phase: start non-virtual → add row virtualizer → add column virtualizer if needed
```

### Open questions

1. When a program cell spans multiple "column slots" in the grid, does the implementation use CSS `grid-column: span N` or absolute positioning with inline width? — Recommendation: absolute positioning within a fixed-height scroll container (like v7) avoids the span calculation; but `grid-column: span N` is simpler with react-virtual. Decide before EPGGrid PR.
2. The side drawer (v6 design) needs reconciliation with the app shell sidebar (from channel list v6-tvguide). On desktop ≥1440px, both could coexist; at 1024–1440px the drawer would need to overlay or replace the sidebar. This needs a layout contract with the `frontend` agent.
3. Genre ARIB code mapping: lv1 integer 0x0–0xF → our `g-*` CSS class. A lookup table needed in `ProgramCell.tsx`.
4. Mirakc returns programs sorted by `startAt` per service. The frontend must group them by `serviceId` → channel. Consider whether this grouping happens in the API layer (`GET /api/programs?groupBy=channel`) or purely frontend.
5. `touch-action` CSS on mobile: the horizontal-scroll grid area needs `touch-action: pan-x pan-y` to allow both axes. The agenda list body needs `touch-action: pan-y` only.
