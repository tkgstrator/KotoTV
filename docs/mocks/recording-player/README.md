# Mock: Recording Player (`/recordings/$id`)

## Goal

Let the user watch a previously-recorded programme with full VOD seek control,
optionally jump to auto-detected chapters, and resume from where they left off.
Interaction pattern is "見返す": open → seek/skip → done. No retention loop.

## Constraints / inputs

**Data available**
```ts
// from recording DB row
{ id, title, channelName, channelType, startAt, endAt, filePath, fileSizeBytes, status }

// derived
durationSec      // endAt - startAt
watchedPositionSec // persisted in localStorage or server
chapters[]       // stub — auto-detected candidate list: { label, startSec }

// HLS session (POST /api/streams/recording/:id)
{ sessionId, playlistUrl }  // VOD playlist (#EXT-X-PLAYLIST-TYPE:VOD)
```

**Must-have controls**
- Back (→ /recordings)
- Seekbar with buffered bar + chapter markers + drag thumb
- Skip −10 s / +10 s buttons
- Play / Pause
- Mute
- Playback rate selector (0.75 / 1.0 / 1.25 / 1.5 / 2.0×)
- Quality picker (Shadcn `DropdownMenu`)
- Fullscreen
- Watched-progress indicator (not a hard gate, just informational)

**Remote-control / spatial-nav requirements (`.claude/skills/spatial-nav/SKILL.md`)**
- DOM order = visual order = focus order
- All interactive elements have `:focus-visible` ring (`outline: 2px solid ring`)
- No hover-only affordances
- Seekbar: `role="slider"`, `tabindex="0"`, Left/Right arrow = seek 10 s

**States required**
- Loading (HLS generation in progress, show progress %)
- Playing
- Paused
- Error (file missing / corrupt)
- Arrival / resume choice (if `watchedPositionSec > 0`)

---

## Variants

### v1 — Persistent Controls + Info Panel (live-v2 family)

- **Layout**: Identical shell to live-v2 (video column + always-visible bar below +
  320 px right panel). Right panel swapped from "next programmes" to
  "programme info + chapter list + resume footer".
- **Chapter display**: Text list in the right panel's `ScrollArea`. Active chapter
  highlighted with primary colour accent. Seekbar has thin 2 px markers.
- **Resume**: Small progress row in panel footer ("続きから 34:12").
- **Trade-off**: Highest continuity with live player — a user switching from live to
  recording sees the same chrome. Panel wastes horizontal space on narrow viewports;
  chapters are accessible but not prominently featured.

### v2 — Theater Mode + Chapter Thumbnail Rail

- **Layout**: Wider video (fills ~58% of viewport height), no sidebar. Controls bar
  below video. Below that: compact program info row + horizontal-scroll thumbnail
  rail for chapters.
- **Chapter display**: 140 px card thumbnails in a `ScrollArea` horizontal rail.
  Active card has primary border + play overlay. Seekbar retains thin markers.
- **Resume**: Subtle clock icon in top app bar ("続きから 34:12").
- **Trade-off**: More video real-estate, visually richer chapter browsing. Thumbnail
  placeholders are just gradients (no actual frames). Rail takes vertical space and
  may feel over-engineered for short recordings with few chapters.

### v3 — Overlay Auto-hide + Resume Card Arrival

- **Layout**: Full-bleed video. Thin always-visible top chrome (back, title, time).
  Bottom controls auto-hide after 3 s of no activity; show on move/click. Arrival
  shows a centred frosted-glass "続きから / 最初から" card.
- **Chapter display**: Only inline seekbar markers + tiny labels above bar. No
  separate chapter list visible while playing — immersive mode.
- **Resume**: First-class arrival card (frosted glass Dialog) with progress bar and
  two buttons. Most decisive of all variants.
- **Trade-off**: Maximises video. Overlay controls require JS to toggle visibility
  (no-JS mock shows them permanently). Focus order breaks when controls are hidden
  (spatial-nav concern — must ensure controls stay in DOM, only `opacity`/`pointer-events`
  toggled, never `display:none`). Chapter browsing is poor.

### v4 — Split Top-Chrome + Chapter Drawer + Chronological Queue

- **Layout**: Explicit top chrome (title + meta + watched progress). Video + control
  bar (left). 320 px right panel with tab bar: "チャプター" | "次の録画" | "番組情報".
  Bottom of panel has a "next recording" card.
- **Chapter display**: Thumbnail list in Chapters tab, same style as v1 but with
  tab chrome overhead. Queue tab shows same-channel recordings in chronological
  order (same-channel queue, not series-aware).
- **Resume**: Not surfaced — assumes HLS starts from `startOffset` passed to
  server; no explicit user prompt.
- **Trade-off**: Most information-dense. Tabs introduce interaction overhead and
  break the "パッと見返す" philosophy slightly. Queue feature is the only variant
  showing next-up integration, useful for binge-watching same-channel archive.

### v5 — Mobile-First Single Column + Prominent Seekbar

- **Layout**: No sidebar. Single column: video → big seekbar section → controls →
  info → chapter list. Playback rate is inline row of segmented buttons (no
  `DropdownMenu`) for one-tap access. Desktop expands to 900 px constrained width
  with a 2-column info+chapters grid below.
- **Chapter display**: Always-visible vertical list with coloured left-bar accent on
  active item. Seekbar chapter markers are taller (20 px) with colour coding
  (past = primary-tint, future = muted).
- **Resume**: Not shown (would be a bottom sheet on mobile or inline card).
- **Trade-off**: Best mobile ergonomics, lowest cognitive load. Rate selector is
  immediately visible without a dropdown. No sidebar means desktop has unused
  horizontal space unless constrained. Seekbar section is the UI centrepiece —
  good for a seek-heavy workflow (documentary skimming), but the tall seekbar zone
  pushes controls down on mobile.

---

## Recommendation

**v1** — because:

1. Directly extends live-v2 (the accepted live player design). The same shell
   (`app-bar` + `desktop-video-col` + `desktop-ctrl-bar` + `desktop-side`) is
   reused; `frontend` only needs to swap panel content and add seek controls to the
   bar. Zero "different team" feeling.
2. Persistent controls match the tvOS/spatial-nav requirement: no auto-hide, no
   focus trap risk.
3. The 320 px panel is the correct surface for chapter navigation — same place the
   user already learned to look for "next programmes" in live mode.
4. Resume footer in the panel is low-key (no intrusive modal on arrival), which
   suits "パッと見返す".

**Caveat**: if chapter browsing becomes a primary use-case (e.g. documentary skimming
with many chapters), consider v4's tab approach. For now chapters are stubs, so v1's
simple list is proportionate.

**Retrofits to the live player** recommended after picking v1:

- Add skip ±10 s buttons to the live-v2 control bar (they do nothing on live-edge
  but become meaningful if time-shifted buffering is added later).
- Add the playback-rate button stub to live-v2 (disabled on live, enabled on
  recording). This prevents the bar layout from looking different between modes.
- Considered but **not** retrofitted: seekbar. Live uses a plain progress bar
  (non-interactive by design — no seeking in live-edge). Keep them distinct;
  the seekbar is a recording-only affordance. Use `role="progressbar"` (live) vs
  `role="slider"` (recording) to make the semantic difference clear.

---

## Handoff notes for `frontend`

**Route**: `packages/client/src/routes/recordings/$id.tsx`

**Shadcn primitives**
| UI element | Primitive |
|------------|-----------|
| App bar back link | `Button` variant `ghost` + `Link` |
| Seekbar | `Slider` (override thumb and track CSS vars) |
| Playback rate | `DropdownMenu` (trigger = Button ghost "1.0×") |
| Quality picker | `DropdownMenu` |
| Chapter list | `ScrollArea` wrapping list of `Button` ghost items |
| Resume footer progress | raw `div` (too small for `Progress` primitive) |
| Loading skeleton | `Skeleton` |
| Error state back/retry | `Button` variants ghost + default |
| Chapter markers on seekbar | absolute-positioned `div` children inside Slider track |

**Tailwind tokens used**
- `bg-card`, `text-card-foreground`, `border-border`
- `bg-muted`, `text-muted-foreground`
- `bg-primary`, `text-primary-foreground`
- `ring` — focus rings via `focus-visible:ring-2 focus-visible:ring-ring`
- `bg-destructive` — error states
- `text-foreground/70` — timestamp ghost on video

**`HlsPlayer` extension** (per phase plan)
```ts
// useStream union type
type StreamSource =
  | { type: 'live'; channelId: string }
  | { type: 'recording'; recordingId: string; startPositionSec?: number }

// HlsPlayer prop
<HlsPlayer
  src={playlistUrl}
  lowLatency={false}         // recording: false
  onTimeUpdate={handleTimeUpdate}
  initialTime={watchedSec}   // resume position
/>
```

**Focus / spatial-nav checklist**
- Seekbar: `tabIndex={0}`, `role="slider"`, `aria-valuemin/max/now`; Left/Right
  key handlers seek ±10 s
- Skip buttons: `tabIndex={0}`, `aria-label`
- Chapter items: `tabIndex={0}`, `role="option"`, `Enter` jumps to chapter
- Controls wrapper: `role="toolbar"`, `aria-label="再生コントロール"`
- DOM order: back → title → seekbar → skip-back → play → skip-fwd → mute → rate →
  quality → fullscreen → chapter list

**Not decided yet**
- Whether watched-position is persisted in `localStorage` or server-side DB
  (`recordings.watchedPositionSec` column). Mock assumes `localStorage` for Phase 5.
- Real chapter detection algorithm (audio silence, scene change, or manual).
  Mock shows stubs labeled "候補 (自動検出)".
- Auto-play next recording (v4 queue): not in Phase 5 scope.
