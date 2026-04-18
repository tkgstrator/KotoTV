# Mock: Recording Player (`/recordings/$id`)

## Goal

Let the user watch a previously-recorded programme with full VOD seek control,
optionally jump to auto-detected chapters, and resume from where they left off.
Interaction pattern is "見返す": open → seek/skip → done. No retention loop.

---

## Legacy direction (v1–v5) — deprecated 2026-04-17

v1–v5 were designed before the EPG v4 + states/v3 vocabulary was locked.
They inherit the "live-v2 family" shell and rounded-card chapter thumbnails.
Kept as reference only. Do not use as the basis for React implementation.

- **v1** — Persistent Controls + Info Panel (live-v2 family)
- **v2** — Theater Mode + Chapter Thumbnail Rail
- **v3** — Overlay Auto-hide + Resume Card Arrival
- **v4** — Split Top-Chrome + Chapter Drawer + Chronological Queue
- **v5** — Mobile-First Single Column + Prominent Seekbar

---

## Current direction (v10+) — active 2026-04-17

Design vocabulary locked to **EPG v4** (pinned identity strip, `NOW`-row idiom)
and **states/v3** (monospace status chips, log tail, square corners for status,
`rounded-md` max for action buttons, status-code grammar).

### Shared design rules across all v10+ variants

- All status chips: `border-radius: 3px`, monospace font, 2px border, no solid fill
- Chip grammar: `VOD`, `OK`, `ERR`, `WARN`, `FATAL`, `BUF`, `CHAP`, `LOADING`
- Chapter list: data table rows (timestamp | title), square corners, no thumbnails
- Seekbar: `role="slider"`, chapter ticks as 2px absolute `div`s, `rounded-2` corners
- Resume: monospace timecode chip (not a modal, not a friendly card)
- Error: inline log tail (auto-expand on FATAL, collapsed on OK)
- Focus rings: `outline: 2px solid hsl(var(--ring))`, `outline-offset: 3px`
- No `#000`/`#fff` — Shadcn CSS vars only
- Buffered bar: `hsl(var(--muted-foreground)/0.3)`, played bar: `hsl(var(--primary))`
- Font stack: JetBrains Mono → Fira Code → Menlo → system-ui (monospace first, sans
  for title text only)

---

## Variants

### v10 — Pinned Identity Strip (EPG NOW-row) + Side Chapter Table

- **Identity**: Two-row strip pinned at top of screen (back + title row / chips row).
  Direct analogue of EPG v4's NOW-strip. Resume chip lives in the top row.
- **Chapters**: Right side panel (300px), chapter data table with `grid` layout
  (timestamp col | title col | icon col). Active row has left-border primary accent.
- **Log on error**: Inline card with log tail, always visible in the video well
  (not collapsed). Destructive border accent on the error container.
- **Resume**: `chip-resume` button in the identity strip chips row.
- **Trade-off**: Most faithful to EPG v4 idiom. Side panel takes horizontal space;
  on narrow desktop the chapter table may crowd the video. The strip at the top gives
  the clearest title/channel identity at a glance.

### v11 — Left Rail Identity Column + Seekbar Chapter Labels

- **Identity**: 240px left rail (like EPG's channel-label column) holds all recording
  metadata, chip cluster, watched-progress bar, resume chip, and chapter table.
  Video+controls fill the remaining width.
- **Chapters**: Left rail contains the chapter table (same data-table style). Seekbar
  also has small chapter labels rendered as absolute-positioned spans below the track
  (chapter name floats above/below tick).
- **Log on error**: Shown in the video-well center (no left rail change needed).
- **Resume**: Monospace button chip in the left rail header section.
- **Trade-off**: Left rail mirrors EPG's sticky channel-label column — cross-screen
  consistency with the EPG grid. Rail forces a fixed 240px width; on very narrow
  viewports it collapses to a top bar. Double-exposure of chapter info (rail + seekbar)
  may be redundant but aids at-a-glance navigation.

### v12 — Inline-Above-Seek Identity Strip + Collapsed Fault Log + Auto-Resume Toast

- **Identity**: Title sits inline ABOVE the seekbar (between video and seek track),
  not in a separate fixed header. App bar is minimal (back + breadcrumb + status chips
  only). Status chips live in the app bar, not below the title.
- **Chapters**: Narrow side panel (260px) for chapter table. Seekbar shows chapter
  ticks + a separate 16px label row below the track (chapter names floating at their
  percentage positions).
- **Log on error**: `<details>` toggle in the ctrl-zone footer. Collapsed by default
  when OK; auto-expanded (open attribute) when FATAL. The toggle button itself
  reflects the log status via chip (OK green / FATAL red).
- **Resume**: Toast overlay on the video well on arrival. Non-modal — no blocking
  dialog. Includes timecode chip + "最初から" dismiss. Disappears after user acts or
  after a timeout (JS would handle; mock shows static state).
- **Trade-off**: Most information-dense in the ctrl-zone (identity + chips + seek +
  chapter labels + fault-log toggle = 5 rows). On very short viewports the ctrl-zone
  may push video too small. Chapters are visible both in the seekbar row and the side
  panel. The collapsed fault log keeps the surface clean in the happy path.

---

## Chosen variant

**v12 — inline-above-seek identity strip + collapsed fault log + auto-resume toast** (confirmed by user 2026-04-17).

Designer recommended v10, user picked v12. Implementation implications:

- **Fault log is collapsed by default** (`<details>` / Shadcn `Collapsible`), auto-expand on FATAL. Unlike v10's always-visible log, this keeps the ctrl-zone quiet when everything is healthy.
- **Cross-screen retrofit**: designer recommended adding the same collapsed-log toggle to live-player v10 (currently always-visible 5-line tail). Do this during Phase 2 so both players share the `<FaultLog>` component.
- **Auto-resume toast**: on arrival, non-modal overlay inside the video well ("続きから 34:12"). Dismisses automatically after interaction or ~5s. Needs coordination with Phase 6 `<Sonner>` tokens so the toast doesn't stack with unrelated toasts.
- **Inline identity strip** sits between the video well and the seekbar — NOT a fixed header. App-bar above is minimal (breadcrumb + chips only), leaving more vertical room for the video.
- `role="slider"` on seekbar with chapter tick marks. Shared `<PlayerControls isLive={false}>` component from Phase 2 (per plan).

## Designer recommendation (not picked)

**v10** — because:

1. The pinned two-row identity strip is the most direct translation of EPG v4's
   NOW-strip into a recording context. Users who know EPG v4 will immediately read the
   top surface as "what this recording is."
2. The 300px right panel keeps chapter navigation at the side — same spatial location
   the user already expects from live-v2's "next programmes" panel — with zero
   relearning cost.
3. The resume chip in the top strip row is immediately scannable and never intrusive
   (no toast, no modal).
4. The always-visible inline log tail on error (v10) is more direct than a collapsible
   toggle (v12) — errors should not require an extra click to diagnose.
5. Chapters as a data table (v10 side panel) is the clearest expression of the
   "diagnostic dense" idiom from states/v3 — timestamps in monospace, titles in sans,
   square rows, no thumbnail crops.

**Why not v11**: The left rail is powerful but duplicates chapter info (rail + seekbar
labels). It also breaks the EPG idiom slightly — in EPG the left column is channels
(navigation), not content metadata. Using it for recording identity feels off-genre.

**Why not v12**: The collapsible fault log requires an extra click to diagnose errors,
which opposes the "diagnostic dense" philosophy of states/v3. The auto-resume toast
works well but adds complexity. The "identity strip inline above seek" is clever but
less immediately legible than a pinned strip.

### Cross-screen recommendations (for live player rebuild)

- **Add the two-row pinned strip** to the live player (with `LIVE` chip replacing `VOD`
  and `resume chip` absent). This gives identical chrome across both modes.
- **Add `role="slider"` seekbar** structure to the live player for future time-shifting
  (currently `role="progressbar"` is correct for live-edge, but the component tree
  should be ready to swap).
- **Fault log toggle** from v12 should flow into the live player as a persistent
  diagnostic surface — live transcoder errors are harder to surface otherwise.
- **Chip grammar** (`OK`, `BUF`, `ERR`) should be a shared component used by both
  live and recording player.

---

## Constraints / inputs

**Data available**
```ts
// from recording DB row
{ id, title, channelName, channelType, startAt, endAt, filePath, fileSizeBytes, status }

// derived
durationSec          // endAt - startAt
watchedPositionSec   // persisted in localStorage or server
chapters[]           // stub: { label, startSec } — auto-detected candidates

// HLS session (POST /api/streams/recording/:id)
{ sessionId, playlistUrl }  // VOD playlist (#EXT-X-PLAYLIST-TYPE:VOD)

// Diagnostic
{ codec, resolution, frameRate, encoder, lastPlayedTimecode, bufferPercent }
```

**Must-have controls**
- Back (→ /recordings)
- Seekbar: `role="slider"`, buffered bar, chapter ticks, drag thumb
- Skip −10 s / +10 s buttons
- Play / Pause
- Mute
- Playback rate selector (0.75 / 1.0 / 1.25 / 1.5 / 2.0×) via `DropdownMenu`
- Fullscreen
- Watched-progress indicator (informational only)

**States required (all v10+ cover all states)**
- Loading (transcoder generating segments — inline log lines + progress bar)
- Playing (mid-playback, resume chip visible)
- Error (FATAL chip, auto-expanded log tail in v10/v12; inline panel in v11)
- Empty chapters (CHAP NONE chip, dashed empty state)
- Arrival / resume (chip or toast)

---

## Handoff notes for `frontend`

**Route**: `packages/client/src/routes/recordings/$id.tsx`

**Shadcn primitives**
| UI element | Primitive |
|------------|-----------|
| Back link | `Button` variant `ghost` + router `Link` |
| Status chips | `Badge` variant `outline` (override with monospace CSS) |
| Seekbar | `Slider` (override track/thumb CSS vars; add absolute `div` children for ticks) |
| Playback rate | `DropdownMenu` (trigger = Button variant ghost "1.0×") |
| Chapter list | `ScrollArea` wrapping `ul`/`li` rows |
| Resume chip | `Button` variant `outline` (primary color override) |
| Loading skeleton | `Skeleton` |
| Error / log | `Collapsible` (fault log toggle in v12), or always-visible `div` (v10) |
| Toast (v12 resume) | `Sonner` toast or custom non-modal overlay |
| Tooltip on chapter tick | `Tooltip` (hover shows chapter name) |

**Tailwind tokens used**
- `bg-card`, `text-card-foreground`, `border-border`
- `bg-muted`, `text-muted-foreground`
- `bg-primary`, `text-primary-foreground`
- `ring` — `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`
- `bg-destructive/10` + `border-destructive/35` + `text-destructive` — error chips / log
- `bg-success/10` + `border-success/35` + `text-success` — OK chips (CSS var `--success`)
- `bg-warning/10` + `border-warning/35` + `text-warning` — WARN / BUF chips

**Seekbar implementation (Slider override)**
```tsx
// role="slider" is Slider's default; extend with chapter markers:
<div class="relative">
  <Slider value={position} min={0} max={duration} step={1} onValueChange={seek} />
  {chapters.map(ch => (
    <div
      key={ch.startSec}
      class="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-foreground/45 pointer-events-none"
      style={{ left: `${(ch.startSec / duration) * 100}%` }}
    />
  ))}
</div>
```

**Focus / spatial-nav checklist**
- Seekbar: `tabIndex={0}`, `role="slider"`, `aria-valuemin/max/now`; Left/Right → ±10s
- Skip buttons: `tabIndex={0}`, `aria-label`
- Chapter rows: `tabIndex={0}`, `role="option"` or `role="listitem"`, Enter = jump
- Controls wrapper: `role="toolbar"`, `aria-label="再生コントロール"`
- DOM order: back → identity strip → seekbar → skip-back → play → skip-fwd → mute →
  rate → fullscreen → chapter list
- Fault log toggle: `aria-expanded`, `aria-controls` linking to log body

**`HlsPlayer` extension**
```ts
type StreamSource =
  | { type: 'live'; channelId: string }
  | { type: 'recording'; recordingId: string; startPositionSec?: number }

<HlsPlayer
  src={playlistUrl}
  lowLatency={false}
  onTimeUpdate={handleTimeUpdate}
  initialTime={watchedPositionSec}  // resume position
/>
```

**Not decided yet**
- Whether `watchedPositionSec` is persisted in `localStorage` or a server-side
  `recordings.watchedPositionSec` column. Mock assumes `localStorage`.
- Chapter detection algorithm (audio silence detection, scene-change heuristic, or
  manual input). Mock shows stubs labeled `候補 (自動検出)`.
- Whether `chapters[]` comes from a separate API endpoint or is embedded in the
  recording row. Open question for backend design.
- Auto-play next recording: not in scope, not in any v10+ variant.
- Chapter detection timing: mock assumes chapters are available after recording
  completes. Real implementation may need to re-fetch after a delay.
