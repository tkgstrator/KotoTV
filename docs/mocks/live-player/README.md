# Mock: Live TV Player Screen

---

## Legacy direction (v1–v3)

Deprecated 2026-04-17, kept for reference only. These predate the `epg/v4` + `states/v3` design vocabulary. They use soft decorative chrome and lack monospace status chips and inline log surfaces.

- **v1** — Overlay controls (immersive, gradient bars)
- **v2** — Persistent controls bar (tvOS-friendly shell — viable structure, wrong register)
- **v3** — Mobile-first minimal split

---

## Current direction (v10+)

Design vocabulary: `epg/v4` NOW-strip idiom + `states/v3` diagnostic dense chips + `channel-list/v6-tvguide` app-bar chrome.

### Core vocabulary rules shared by all v10+ variants

- Status chips: `.chip` with `.chip-live / .chip-ok / .chip-buf / .chip-err / .chip-fatal / .chip-info` — monospace, `border-radius: 3px`, square-adjacent (never `rounded-full` on status surfaces).
- `border-radius: 5–6px` max on action buttons. `rounded-md` equivalent.
- Elapsed bar = the "seek bar" equivalent for live. Always visible, prominent, not decorative.
- Log tail: real-looking lines (`[qsv]`, `[mirakc]`, `[hls]`, `[player]` prefixes). Inline on fatal, sidebar/drawer/bottom in normal operation.
- Monospace font stack: `"JetBrains Mono", "Fira Code", "Menlo", "Consolas", monospace` — used for all chips, log lines, stat values, times.
- No `#000` / `#fff`. CSS custom properties (`hsl(var(--*))`) throughout.
- All interactive elements have visible `:focus-visible` ring (`2px solid hsl(var(--ring))`). DOM order = visual order = tab order.
- Dark and light themes demonstrated via `html.dark` class toggle button in each mock.

---

## Variants

### v10 — NOW-strip above video + right stats sidebar (always-on diagnostics)

- Prominent NOW-strip pinned above the main area: shows program title, elapsed/remaining bar, and time range — mirrors `epg/v4` NOW card vocabulary in a horizontal bar.
- Right 240px sidebar is always open: STREAM / HLS / SESSION / NEXT / LOG sections. All monospace stat rows. Log tail always visible.
- Controls bar: muted below video, quality chip, fullscreen. Seek bar stub greyed-out (live).
- Trade-off: densest information surface; sidebar competes for horizontal space on smaller desktops. Excellent for power users. The constant sidebar may feel heavy for "quick watch" sessions.

### v11 — Full-bleed video + NOW-bar pinned at bottom + collapsible diagnostic drawer

- Video fills the full-height space between app-bar and NOW-bar.
- NOW-bar is a compact persistent strip pinned below the video (not overlay): program title + elapsed bar + remaining time + status chips. Never hides.
- Controls overlay at the bottom of the video (gradient), always visible in mock.
- Diagnostic drawer: toggled via keyboard `D` or button — slides up from bottom, 2-col layout (stats + log). Fault states auto-open it.
- Trade-off: maximum video real estate on desktop; the NOW-bar stays visible but doesn't consume a full sidebar column. Drawer means diagnostics require a deliberate open action — acceptable for normal operation, auto-opens on fault. The overlay controls add a `z-index` management burden in React.

### v12 — Left NOW-panel (vertical) + full control stack + always-on inline log

- Program info sidebar is on the left (260px): large NOW title, 5px elapsed bar, programme description, scrollable next-programmes list. Mirrors `epg/v4` NOW card turned vertical.
- Video column is center-right. Control bar below video: full parity with recording player — skip ±10s buttons present but `aria-disabled` on live, quality, PiP, fullscreen, keyboard-hint strip.
- Inline 80px log tail always visible below controls — not fault-only. Header shows streaming/stalling/terminated chip.
- Trade-off: clearest program-context affordance (description visible without tapping); layout matches the recording-player shell closely (good cross-screen consistency). The left sidebar shrinks available video width more than v11. Inline log is always rendering even when healthy, which is intentional (makes the user feel in control) but adds vertical height.

---

## Recommendation

**v11** — Full-bleed video + NOW-bar + collapsible diagnostic drawer.

Reasoning:

- Video-first is correct for a player. v10's permanent right sidebar and v12's left sidebar both shrink the video unnecessarily on typical 1280–1440px desktops.
- The NOW-bar (persistent, below video, never hidden) satisfies the "strongest NOW affordance" requirement without sacrificing video space. It is the epg/v4 NOW-strip concept applied horizontally at the bottom of the player.
- The collapsible drawer handles the "diagnostic dense, but minimal while playing" tension: diagnostics are one keypress away (`D`), auto-reveal on fault, invisible during healthy playback. This matches "パッと入力、たまに見返す" — the user isn't monitoring a server dashboard, they're watching TV.
- Overlay controls are a risk for spatial-nav, but v11 keeps them always-visible in this mock (production would add a `controls-visible` state). The NOW-bar is never hidden, so the essential program context is always reachable.
- v12's full control stack (disabled skip buttons for live) is a good pattern for recording-player parity — recommend adopting it in v11 as well (see handoff notes below).

**Designer recommendation:** v11
**Chosen variant:** **v10** (confirmed by user 2026-04-17)

User picked v10 over designer's v11. Implementation implications:

- Right sidebar is **permanent** on desktop (`≥lg`), not a drawer. Video width shrinks by 240px. At `<lg` the sidebar collapses below the video as a stacked diagnostics panel.
- Always-visible diagnostics: `STREAM` / `HLS` / `SESSION` / `LOG` sections poll / subscribe at reasonable cadences (target ~1s HLS buffer, ~5s session info).
- Skip ±10s buttons present but `aria-disabled` on live — cross-screen parity with recording player.
- NOW-strip pinned above video: title + elapsed + remaining in monospace. Never hidden.
- `LOG` section shows last ~5 lines with an affordance to open a full log drawer.

---

## Handoff notes for `frontend`

### Where status data comes from

| Field shown in UI | Source |
|---|---|
| `LIVE` / `OK` / `BUF` / `FATAL` chips | Client-side: derived from `hls.js` events (`FRAG_LOADED`, `BUFFER_STALLED_ERROR`, `ERROR`) and stream POST response |
| `HEVC 1080p60` codec chip | `GET /api/streams/:id` response — encoder profile field |
| `FFmpeg → qsv` hw_accel | `GET /api/streams/:id` response — `hwAccel` field |
| `BUF 3.4s` buffer health | `hls.js` `Hls.Events.BUFFER_APPENDED` → `data.stats.buffered` |
| `latency` | Estimated: playlist segment duration × segment count behind live edge |
| `viewers 2` | `streamManager.viewerCount` (server-side, exposed via stream session endpoint) |
| `segment #N` | `hls.js` `FRAG_LOADED` event → `data.frag.sn` |
| Log lines | Server-sent events on `GET /api/streams/:id/log` or piped through WebSocket; client buffers last-N lines in a `useRef` ring buffer |
| `startAt`, `endAt`, elapsed % | `ProgramSummarySchema` from channel data; compute elapsed client-side from `Date.now()` |

### Shadcn primitives

| Mock element | Shadcn primitive |
|---|---|
| Back button, mute, fullscreen, PiP, skip (disabled) | `Button variant="ghost" size="icon"` |
| Quality picker trigger | `Button variant="outline"` + `DropdownMenu` |
| Status chips (LIVE, OK, BUF, FATAL, HEVC 1080p60, etc.) | `Badge` with custom `.chip-*` class — do NOT use `Badge` default variants, override with the chip classes |
| Elapsed / progress bar | `Progress` (Shadcn) with `value` = elapsed % of program duration |
| Seek bar stub (disabled on live) | `Slider` with `disabled` prop — keep in DOM for recording-player parity |
| Loading skeletons | `Skeleton` |
| Log tail scrollable area | `ScrollArea` wrapping `<ul>` of log lines |
| Diagnostic drawer | `Collapsible` (`CollapsibleTrigger` / `CollapsibleContent`) from Shadcn |
| Error card with log | `Card` with `border-l-4 border-destructive` — not `Alert` (too soft, wrong register) |
| Next programs list | `ScrollArea` > `<ul>` |
| Tooltip on disabled skip buttons | `Tooltip` → "ライブ配信ではスキップできません" |
| Separator between control groups | `Separator` with `orientation="vertical"` |

### Monospace font stack

```css
font-family: "JetBrains Mono", "Fira Code", "Menlo", "Consolas", monospace;
```

Apply via a `mono` utility class or Tailwind `font-mono`. Use for: all chip text, all log lines, all stat keys/values, all time labels, clock in app-bar, segment numbers.

### Tailwind tokens

- Video background (always dark regardless of theme): `bg-[hsl(222_30%_5%)]` or a CSS var
- App chrome / NOW-bar: `bg-card text-card-foreground border-border`
- Chip backgrounds: `bg-destructive/15`, `bg-primary/10`, `bg-success/12` etc. (custom CSS vars)
- Primary elapsed fill: `bg-primary`
- Muted track: `bg-muted`
- Focus ring: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2`
- Error accent: `border-l-[3px] border-destructive`
- Log timestamp dimming: `text-muted-foreground/50`

### Interactive states

- All `Button` (ghost/icon): `hover:bg-muted`, `focus-visible:ring-2 focus-visible:ring-ring`, `active:opacity-75`
- Disabled skip buttons: `aria-disabled="true"` + `tabIndex={-1}` + `cursor-not-allowed opacity-35`; they must remain in the DOM for recording-player layout parity
- Diagnostic drawer toggle: `aria-expanded` attribute toggled; `Collapsible` handles focus trap
- `<video>` element: `tabIndex={0}`, `Space` = toggle play, `M` = mute, `F` = fullscreen, `D` = toggle diagnostic drawer
- Keyboard hint strip (`kbd-row`): `aria-hidden="true"` — decorative only

### Component structure (v11)

```
/live/$channelId.tsx
  └── <LivePage>
        ├── <StateTabsDemo />    (remove in production)
        ├── <AppBar>             — back + GR chip + channel name + status chips + clock
        └── <PlayerWrapper>      — flex-col, flex:1
              ├── <VideoFill>        — flex:1, bg dark, tabIndex=0
              │     └── <ControlsOverlay>  — absolute bottom gradient + control buttons
              ├── <NowBar>           — persistent, below video, never hidden
              │     ├── NOW label + dot
              │     ├── <NowBarCenter>  — title + <Progress> elapsed
              │     └── <NowBarChips>  — OK/BUF/FATAL + codec + latency/buf micro-chips
              ├── <DiagToggleButton>  — CollapsibleTrigger
              └── <DiagDrawer>        — CollapsibleContent, max-height animated
                    ├── <DiagStats>   — stat-row grid (codec, hw_accel, bitrate…)
                    └── <DiagLog>     — ScrollArea > log lines
```

### Recording-player cross-screen notes

- The skip ±10s buttons (present in v12, absent in v11) should be added to the recording player with `aria-disabled={false}`. The live player shows them disabled for UI parity. Implement both players with the same `<PlayerControls>` component, passing `isLive: boolean`.
- `isLive=true`: seek bar disabled (`Slider disabled`), skip buttons `aria-disabled`, live edge chip visible.
- `isLive=false`: seek bar active, skip functional, `LIVE` chip replaced by elapsed time `HH:MM:SS / HH:MM:SS`.
- The `DiagDrawer` component is identical for both. Status data sources differ (`hls.js` events are the same; codec/hw_accel come from the same `GET /api/streams/:id` endpoint).
- Keyboard shortcut `D` to toggle diagnostics should be consistent across both players.

### Open questions

- Auto-hide for the overlay controls in v11: production should show controls for 3s after any pointer/keyboard event, then fade. The NOW-bar must never hide. Suggested: `useIdleTimeout(3000)` hook controlling a `controlsVisible` state.
- Does the `DiagDrawer` auto-open on `FATAL`? Recommended yes — trigger `setOpen(true)` in the `hls.js` error event handler.
- Log streaming: SSE vs WebSocket? SSE is simpler (one-way). Suggest `EventSource` on `GET /api/streams/:id/events`, with `type: 'log'` events. Client buffers last 50 lines in `useRef`.
- Viewer count: polling `GET /api/streams/:id` every 10s, or pushed via SSE? SSE preferred if already open.
- `hls.js` version to target for buffer health events: confirm `Hls.Events.BUFFER_APPENDED` data shape before implementing `useLiveStream` hook.
