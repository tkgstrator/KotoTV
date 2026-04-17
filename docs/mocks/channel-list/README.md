# Mock: Channel List

## Goal

The user opens the app while away from home and wants to pick a channel and start watching live TV as fast as possible. The screen must scan instantly — no engagement UX, no feature discovery clutter.

## Constraints / inputs

- Data available: `ChannelSchema` from `packages/server/src/schemas/Channel.dto.ts` (not yet written). Expected fields per channel: `id`, `name`, `shortName`, `type` (`"GR" | "BS" | "CS"`), `channelNumber`.
- Must-have controls: GR / BS / CS type filter; per-card channel name, type badge, channel number, watch affordance.
- Query key pattern: `["channels", type]` — filter is driven by URL search param (TanStack Router).
- Remote-control / focus requirements: every card is a single focusable `<a>` element (whole card = hit target), visible `:focus-visible` ring, DOM order matches visual order, no hover-only affordances.

## Variants

### v1 — Top tabs + auto-fill card grid

- Layout: sticky header + sticky tab bar (GR / BS / CS), body is a responsive `auto-fill minmax(200px)` grid of Cards.
- Trade-off: simple, familiar to web users, scales well from mobile to wide desktop. The extra sticky layer can feel cramped on small screens (two sticky bars).

### v2 — Left sidebar + compact list

- Layout: persistent 180px left sidebar with type nav + channel count badges, right pane shows a Card wrapping a `<ul>` of dense list rows (ch number avatar, name, badge, watch button flush right).
- Trade-off: higher information density — more channels visible without scrolling, clear active-state in sidebar. Sidebar costs horizontal space; on mobile it would collapse to a drawer (not shown in this static mock). Well-suited for power users who already know their channels.

### v3 — Segmented control in header + dense card grid (recommended)

- Layout: segmented control (pill group) embedded in the app header row, below is a page title + `auto-fill minmax(160px)` grid. Each card has a 3px type-coloured top accent bar, name, short name, and a full-width watch button.
- Trade-off: the segmented control takes up zero extra vertical space (lives in the header). Cards are compact but still large enough for thumb / remote activation. Type colour coding (blue GR / green BS / amber CS) provides instant orientation without reading text.

## Recommendation

**v3** — because:

1. The segmented control in the header eliminates the two-sticky-bar problem of v1 while keeping filter access immediate.
2. The accent-bar colour coding communicates type at a glance, which is useful when the "すべて" (all) filter is active and cards of mixed types appear together.
3. Card size (160px min) comfortably meets remote-control hit-target requirements without the wasted whitespace of v1's 200px cards.
4. The layout is fully single-column on mobile and expands gracefully — no sidebar complexity to handle responsively.

## Handoff notes for `frontend`

### EPG data model per card (Phase 1 use mock fixtures; Phase 3 wires live API)

Each channel card now surfaces programme data derived from `MirakcProgram`:

```ts
type CardProgramData = {
  currentProgram: {
    name: string        // displayed as dominant title
    startAt: number     // unix ms — used to compute time range string
    duration: number    // ms — used to compute progress %
  } | null
  nextProgram: {
    name: string
    startAt: number     // shown as "次: <name> HH:MM"
  } | null
}
```

**API call**: `GET /api/programs?serviceId=<channelId>` — one call per channel, made in parallel.  
**Phase 1**: render from inline fixture data (same values as the mocks).  
**Phase 3**: replace fixtures with `useQuery(["programs", channelId])`.

Progress % = `(Date.now() - startAt) / duration * 100`, clamped to [0, 100].

### Programme fields per variant

| Variant | Current title | Time range | Progress bar | Next program | Synopsis |
|---------|--------------|------------|--------------|-------------|---------|
| v1 (grid) | bold, 2-line | shown | 3px bar | "次: … HH:MM" | 1 line muted |
| v2 (list) | bold, 1-line truncated | shown | 3px bar | "次: … HH:MM" | — |
| v3 (grid) | bold, 2-line | shown | 3px bar | "次: … HH:MM" | — |
| mobile-v1 (cards) | bold, 2-line | shown | 3px bar | "次: … HH:MM" | — |
| mobile-v2 (rows) | bold, 2-line | shown | 3px bar | "次: … HH:MM" | — |

### Progress bar urgency state

When progress >= 90%: `prog-fill` switches to `hsl(0 72% 58%)` (destructive red).  
The "次:" label is replaced with `まもなく終了` in red. Implement as a computed class:

```tsx
const isUrgent = progress >= 0.9
<div className={cn("h-[3px] rounded-full", isUrgent ? "bg-destructive" : "bg-primary")}
     style={{ width: `${progress * 100}%` }} />
```

### Shadcn primitives to use

- `Card`, `CardContent` — `ChannelCard` wrapper (no `CardHeader`/`CardFooter`; accent bar is a `<div>` or `::before`)
- `Badge` — type indicator (GR / BS / CS); `variant="secondary"` + colour override via `className`
- `Button` — watch affordance; `variant="default"`, `size="sm"`
- `ScrollArea` — wrap the card grid so header stays sticky on long lists
- `Skeleton` — loading state; skeleton shape includes the progress bar row

### Tailwind tokens

| Role | Token |
|------|-------|
| Page background | `bg-background` |
| Card surface | `bg-card text-card-foreground` |
| Subtle text | `text-muted-foreground` |
| Borders | `border-border` |
| Progress track | `bg-muted` |
| Progress fill | `bg-primary` (normal) / `bg-destructive` (urgent) |
| Primary action | `bg-primary text-primary-foreground` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |

### Type accent colours (consistent across all variants)

| Type | Colour |
|------|--------|
| GR | `hsl(221 83% 60%)` — blue |
| BS | `hsl(142 70% 48%)` — green |
| CS | `hsl(38 92% 52%)` — amber |

### Component structure suggestion

```tsx
// ChannelCard.tsx
<a href={`/live/${channel.id}`} className={cn("ch-card", `type-${channel.type.toLowerCase()}`)}>
  {/* 3px accent bar */}
  <CardContent>
    <div className="flex justify-between text-xs text-muted-foreground mb-1">
      <span>{channel.name} · {channel.shortName}</span>
      <Badge variant="secondary" className={typeBadgeClass(channel.type)}>{channel.type}</Badge>
    </div>
    {currentProgram ? (
      <>
        <p className="font-extrabold text-[0.9375rem] leading-snug line-clamp-2 mb-1">
          {currentProgram.name}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground mb-1">{timeRange}</p>
        <div className="h-[3px] rounded-full bg-muted overflow-hidden mb-1.5">
          <div className={cn("h-full rounded-full", isUrgent ? "bg-destructive" : "bg-primary")}
               style={{ width: `${progress}%` }} />
        </div>
        {nextProgram && !isUrgent && (
          <p className="text-[0.625rem] text-muted-foreground truncate">次: {nextProgram.name} {nextTime}</p>
        )}
        {isUrgent && <p className="text-[0.625rem] text-destructive">まもなく終了</p>}
      </>
    ) : (
      <p className="text-xs text-muted-foreground">番組情報なし</p>
    )}
  </CardContent>
</a>
```

### Interactive states defined in mocks

| State | Visual |
|-------|--------|
| Default | `bg-card`, `border-border` |
| Hover | `border-primary/50`, shadow with primary tint |
| Focus-visible | 2px `ring` outline, offset 2px |
| Active / pressed | card opacity 0.8 |
| Loading | Shimmer `Skeleton` — includes progress bar row in skeleton shape |
| Error | Bordered panel, retry `Button` |
| Empty | Dashed border panel, explanatory copy |
| Urgent (≥90%) | Progress bar red, "まもなく終了" label in destructive colour |

### Focus / spatial-nav notes

- Entire `<a>` card is the tab stop. Inner play button: `tabIndex={-1}`.
- Grid DOM order = channel number order (sort by `channelNumber` server-side).
- On focus: `el.scrollIntoView({ block: 'nearest' })`.
- `aria-label`: `"${channel.name} を視聴"`.

### TanStack Router integration

- Filter state: URL search param `?type=GR`. Use `z.enum(["GR","BS","CS","ALL"]).default("GR")`.
- Segmented control: `navigate({ search: (prev) => ({ ...prev, type }) })`.
- Query keys: `["channels", type]` for channel list; `["programs", channelId]` for EPG per channel.

### Not decided yet

- Whether to animate the progress bar in real time (30-second refresh interval vs. CSS transition on mount).
- Mobile breakpoint: segmented control placement when device is < 360px wide.
- Chosen variant: _(pending user selection)_

---

## Mobile variants

### mobile-v1 — Bottom tab bar + card list

- Layout: persistent bottom nav bar (ライブ / 録画 / 番組表 / 設定), vertical card list with left accent strip, circular play button flush right, section labels per type.
- Trade-off: familiar iOS/Android pattern, easy thumb reach for nav. All channels shown together — no secondary filter tap needed. Section labels give spatial orientation without a filter UI.
- Alignment with desktop v3: **medium** — the colour-coded accent is shared (left strip vs top bar), but the bottom tab bar is an additional structural layer not present in v3.

### mobile-v2 — Sticky filter strip + compact row list

- Layout: compact header + sticky horizontally-scrollable filter pills (GR / BS / CS / すべて), then a full-width dense row list (left border per type, ch number column, name, badge, short name, 視聴 label right).
- Trade-off: maximum channel density — 10+ channels visible at once, filter stays accessible on scroll. No extra nav shell means the component maps 1:1 to the desktop filter + list pattern.
- Alignment with desktop v3: **high** — same filter semantics (GR/BS/CS/ALL), same colour tokens, same badge+accent system. The sticky pill strip is the mobile equivalent of the desktop segmented control in the header.

### Mobile recommendation

**mobile-v2** pairs best with desktop v3. The filter-pill strip directly translates the desktop segmented control concept to mobile without introducing bottom-tab navigation overhead (which would need to be reconciled with TanStack Router's top-level route structure). The dense row list is also a natural single-column collapse of v3's card grid. A responsive implementation can share the same `ChannelCard`/`ChannelRow` component with only layout differences driven by breakpoint.

---

## Variants v4 / v5

### v4 — Hero + Grid (`v4-hero.html`)

One last-watched channel occupies a full 16:9 hero card with gradient overlay, large program title, time range, progress bar, and a prominent play button. All remaining channels fall into an `auto-fill minmax(200px)` tight grid of small tiles below, each with a 4px top accent bar and the same EPG data as v1–v3.

- **Pro**: the hero immediately surfaces the one channel the user is most likely to resume — zero scanning needed in the common case.
- **Con**: the hero eats roughly half the viewport before the grid; if the last-watched data is stale or unavailable the hero degrades awkwardly and needs a fallback.

### v5 — Magazine / Editorial (`v5-magazine.html`)

Asymmetric layout inspired by the Apple TV app: one large featured card (~60% width) on the left, two medium stacked cards on the right, then all remaining channels as a two-column dense list below a divider. Type-coloured channel-number avatars replace the top accent bar in the list rows.

- **Pro**: the three-tier hierarchy (featured / notable / rest) gives editorial weight without requiring explicit curation — the hierarchy maps naturally onto last-watched → currently-airing notable → everything else.
- **Con**: the asymmetric grid requires a fixed sidebar width (260 px) which can feel awkward at intermediate viewport widths (~900–1100 px); needs a breakpoint where the two medium cards collapse into the list.

---

---

## Infeasible variants (tuner constraint)

The following designs were prototyped but are **not viable for production** because they depend on per-channel thumbnail images. Generating thumbnails requires opening a tuner stream for every channel simultaneously. With a typical 2–4 tuner hardware cap, this would lock out all other viewers the moment the channel list renders.

| File | Why infeasible |
|------|---------------|
| `v7-streaming.html` | 16:9 gradient tiles relied on a "live thumbnail" concept; without real imagery the tiles degrade to gradient blobs with no visual differentiation |
| `mobile-v4-swipe.html` | Hero tile + per-type rails both assumed thumbnail fills; the rail swipe pattern collapses without image content in each slot |

These files are kept in the directory for historical reference but must not be chosen as the implementation target.

---

## Variants v8 / v9 / mobile-v5 (logo-led)

Channel logos are served as **static PNGs** from `/api/services/{id}/logo` (Mirakc-confirmed, no tuner required). These variants use logos as the primary visual anchor instead of thumbnails.

**Logo implementation note for `frontend`:**
```html
<!-- Real impl — swap placeholder div for this -->
<img
  src="/api/services/{id}/logo"
  alt="{channel.shortName}"
  width="60" height="60"
  style="border-radius:12px;"
  onError={(e) => { e.currentTarget.style.display='none'; showInitialsFallback(); }}
/>
```
Field `has_logo_data: boolean` on the channel schema controls whether the `<img>` or the initials circle is rendered. When `has_logo_data === false`, render the coloured-circle placeholder directly (no broken-image flicker).

### v8 — Logo Grid (`v8-logo-grid.html`, desktop)

3–4 column `auto-fill` grid. Each card is horizontal: 60px rounded-square logo left, program title + time + progress + next-program right. Inspired by Spotify "Your Library" row density.

- **Pro**: high density (3–4 columns), logo gives instant station recognition, familiar card-grid nav pattern, remote-control friendly (one tab-stop per card).
- **Con**: at narrow viewports (< 700px) cards compress into 1 column; 60px logo slightly overshadows program text at that width.

### v9 — Logo List (`v9-logo-list.html`, desktop)

Single-column list, max-width 860px, centered. Each card is spacious: 72px logo with drop-shadow, 17px bold program title (1-line), subtitle row (ch name + time + next program). Section dividers with channel counts.

- **Pro**: most legible of the desktop variants — program title is prominent and scannable without squinting. The "station card" metaphor (luxurious padding, shadow logo) communicates quality. Good for users who prefer scanning one column.
- **Con**: lower density — about 5–6 channels visible at once on a 1080p display before scrolling. Not ideal for users with many CS channels.

### mobile-v5 — Logo List Compact (`mobile-v5-logo.html`, mobile)

48px logo on the left, bold program title + ch/time metadata stacked on the right, 3px progress bar underneath — similar to a podcast-app episode list. Horizontally-scrollable filter pills in the sticky header.

- **Pro**: logo-first recognition without sacrificing mobile density (8+ channels in one viewport). Single-column list maps directly to TanStack Router filter param + `ScrollArea`. Focus order is strictly top-to-bottom with no horizontal scroll in rows.
- **Con**: 48px logo is slightly small for detailed logos (fine for text-based logos, could clip complex graphics).

---

## Variants v7 / mobile-v4

### v7 — Thumbnail-forward Streaming Grid (`v7-streaming.html`, desktop)

4-column grid (responsive → 3 col → 2 col) of 16:9 gradient tiles. Each tile carries a channel badge + LIVE pulse top corners, a permanent bottom gradient with program title + time + progress bar, and a CSS hover overlay exposing synopsis, next-program, and a Watch button. GR/BS/CS sections are labelled; the header segmented control filters them. The gradient palette keys the type accent hue (blue-purple for GR, teal-green for BS, amber-orange for CS) plus a complementary angular shift to differentiate each channel without real imagery.

- **Pro**: streaming-app familiarity; program content is the primary visual. Hover overlay surfaces synopsis without navigating away.
- **Con**: hover-only overlay is inaccessible on remote control — `frontend` must also trigger overlay content on `:focus-visible`. At 4 columns, tile height limits overlay legibility.

### mobile-v4 — Horizontal-scroll Rail per Type (`mobile-v4-swipe.html`, mobile)

Abema/TVer-style home: a large hero tile (featured GR channel, ~52% aspect) at the top; three horizontal-scroll rails below — one per type. Each rail item is 160×90 px with badge, title overlay, and 3 px progress strip at the bottom edge. Channel name + time appear below. "すべて見る" per rail links to the filtered full list. Sticky bottom tab bar (ライブ / 録画 / 番組表 / 設定).

- **Pro**: swipe-first; type separation without filter taps; hero surfaces the most relevant channel immediately; `rail-scroll` maps directly to `ScrollArea` horizontal + `flex` row.
- **Con**: only ~4–5 tiles per rail before swiping — low density for power users. Bottom tab bar adds a route layer that must align with TanStack Router's top-level structure.

### Handoff notes (v7 + mobile-v4)

- Shadcn primitives: `Card` (tile wrapper), `Badge` (ch-badge), `Button` (Watch overlay / hero), `ScrollArea` (rail), `Skeleton` (shimmer placeholders).
- Tailwind tokens: same table as v1–v3. Progress: `bg-primary` / `bg-destructive` at ≥ 90%.
- Tile focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background`. Hover overlay content must also appear on `:focus-visible`.
- Hover scale: `group-hover:scale-[1.025] transition-transform` on the `<a>` tile.
- Rail scroll: `overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity` — `ScrollArea` horizontal with `scrollHideDelay={0}`.
- Not decided yet: hero slot driven by "last watched" or "highest current progress".

---

## Variants v6 / mobile-v3

### v6 — TV Guide dense 2-column (`v6-tvguide.html`, desktop)

Layout: sticky app header with type filter tabs; body splits into two equal columns (left = GR + BS, right = CS). Each row is a 52px horizontal strip: `56px CH column | current-program cell | next-program cell`. Section labels are sticky below the header. A 2px progress bar sits flush at the bottom of the current-program cell.

- **Pro**: fits ~16 channels without scrolling on a 1080p display. The newspaper-grid aesthetic (週刊TVガイド) makes scanning effortless — eyes move down one column then the next. Column headers ("放送中 / 次の番組") orient first-time users instantly. Urgent rows (≥ 90%) show red progress fill + "まもなく終了" inline label.
- **Con**: the fixed 3-column strip inside each row is tight at viewport widths below ~960px; intended for desktop.

### mobile-v3 — Ultra-compact single-column (`mobile-v3-compact.html`, mobile)

Layout: sticky header (44px) + horizontally-scrollable filter pills (26px); body is a continuous 60px-row list. Each row: 72px left panel (ch number + short name, 3px type accent stripe) | flex-1 right panel (bold title + inline "HH:MM–HH:MM → next 〜" + 2px bottom progress bar).

- **Pro**: 8+ channels in one viewport. The single-line "→ next" format saves a full text row vs. mobile-v1/v2. 60px height meets thumb-target requirements. Focus order is strictly top-to-bottom with no horizontal scroll inside rows.
- **Con**: program titles truncate to one line; long titles lose characters on narrow phones.
