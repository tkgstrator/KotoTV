# Mock: Recordings Management Screen

## Goal

The user wants to quickly schedule a new recording (a few taps / clicks) and occasionally glance at what is scheduled, currently recording, or already saved. The screen must not encourage lingering — it surfaces status at a glance and gets out of the way.

## Constraints / inputs

- Data model (`RecordingSchedule.status`): `pending` → `recording` → `completed` / `failed`; also `cancelled` (pre-start)
- Must-have controls: reserve button, status filter, cancel (pending), stop (recording), play (completed), delete (completed/failed)
- Must show all four live states simultaneously on "all" view
- Remote-control / focus: every interactive element has `:focus-visible` ring; DOM order = visual order = tab order
- No pure black/white; Shadcn CSS-var tokens throughout
- Disk usage metadata available on completed items: `filePath`, `sizeBytes`, `durationSec`
- Completed items have `thumbnailUrl` (served at `GET /api/recordings/:id`, backend extracts a frame at recording end into `data/thumbnails/<recordingId>.jpg`)

---

## Legacy direction (v1–v6) — deprecated 2026-04-17

These variants established the core status-colour and tab-filter vocabulary but predated the thumbnail model. They treated all recording states visually equally (text-only cards) and did not account for the diagnostic-dense register from `states/v3`.

### v1 — Grouped-section flat list + Modal form
- Trade-off: most familiar; no thumbnail surface; modal blocks list context

### v2 — Monthly Calendar view + Side Drawer form
- Trade-off: best temporal overview; terrible on mobile; no thumbnail surface

### v3 — Filtered Tabs list + Bottom Sheet form (mobile-first)
- Trade-off: best mobile ergonomics; no thumbnail differentiation between states

### v4 — Card Grid list + Full-page Stepper form
- Trade-off: visually richest; stepper too high friction for quick reservations; all cards treated identically

### v5 — Date-grouped Timeline list + Inline Expanding form
- Trade-off: best temporal narrative; inline form causes scroll-jump on open

### v6 — Two-column Sidebar + EPG Search Command-Palette Modal
- Trade-off: most information-dense desktop; no visual distinction completed vs non-completed; modal form fastest reservation flow

**Prior recommendation:** v3 list + v6 modal form — superseded by current direction below.

---

## Current direction (v10+) — 2026-04-17

New family adopts the diagnostic-dense register from `docs/mocks/states/v3.html`:
- Monospace font stack throughout
- Status chip grammar: `SCHED` / `REC` / `DONE` / `FAIL` — square corners, color-coded border+fill
- Completed items use real 16:9 thumbnail frames; all other states are text-dense rows with accent bars
- Log-tail drawer on FAIL items (`<details>` in mocks, expand/collapse in production)
- Pulsing `REC` dot for recording-now items
- No pure `#000` / `#fff`; all Shadcn HSL tokens

### v10 — Sectioned single-column feed + Command-palette modal

- List layout: one vertical feed, section headers (REC NOW / SCHED / FAIL / DONE), completed items rendered as a `auto-fill` thumb grid below the text-dense non-completed rows. All four statuses visible simultaneously without a tab switch.
- Form: centred command-palette `Dialog` — search input at top, EPG results in date-grouped list (one click to reserve), manual entry section at bottom with inline `OK`/`ERR` validation chips.
- Trade-off: best "see everything at once" scanning; completed section pushes down if there are many SCHED/FAIL rows; command-palette form is fastest reservation (2 keystrokes + 1 click); desktop-native feel; mobile scrolls naturally but completed grid becomes 2-col.

### v11 — Two-column split: Thumb Archive left + Status Queue right + Side Sheet form

- List layout: left column = completed thumb grid (the "archive"); right fixed panel = recording-now + scheduled + failed as text-dense rows (the "queue"); permanent two-pane at 1fr / 300px on desktop; collapses to single column (queue hidden) on mobile.
- Form: right-side `Sheet` drawer — EPG search, filterable results, manual date/time inputs with inline validation, conflict status chip at the bottom.
- Trade-off: clearest archive/queue mental model; the two item types never compete for visual space; disk usage widget fits naturally at the bottom of the archive column; mobile loses queue visibility (users need the tab bar workaround); the side sheet keeps list context visible; total information density is highest of the three variants.

### v12 — Tab-filtered feed: compact thumb rows on ALL tab + full grid on DONE tab + bottom-sheet form

- List layout: tab bar (ALL / REC / SCHED / DONE / FAIL) with monospace count badges. On ALL tab, completed items show as compact rows with a 96×54px mini-thumb inlined left (16:9, channel bug, duration chip, progress bar, watched ribbon). On DONE tab, same items expand to a full auto-fill `260px` card grid. Non-completed items always appear as text-dense accent-bar rows. Four statuses coexist on ALL tab in sections.
- Form: bottom `Sheet` — mobile-first, drag handle, EPG search + results, manual inputs, conflict chip; adapts to centered dialog on desktop via media query.
- Trade-off: best mobile ergonomics (thumb-friendly tab switching, bottom sheet reachable with one hand); the dual-density trick (compact row on ALL, full grid on DONE) avoids committing to one representation; tab switching is one extra step vs v10's always-visible sections; the bottom sheet is the most thumb-accessible form surface on phones.

---

## Recommendation

**List: v12** (tab-filtered feed with dual-density completed items)
**Form: v12 bottom sheet** (or swap in v10's command-palette for desktop-only contexts)

Combined justification:
- v12's ALL tab satisfies the "see all four statuses simultaneously" requirement while the DONE tab gives the clean thumb grid when the user wants to browse the archive.
- The compact mini-thumb row on the ALL tab is the best compromise between scan speed and thumbnail recognition — the 16:9 frame + channel bug + duration chip + progress bar conveys everything a user needs without the SCHED rows drowning in a tiny column.
- v10 is the runner-up for desktop-centric deployments where the command-palette form is preferred (it exposes all statuses without a tab switch). v11 is best if the team decides the archive/queue split is a first-class mental model worth encoding in a permanent layout.
- Bottom sheet form (v12) + command-palette modal (v10) are not mutually exclusive — the production implementation can use the sheet on narrow viewports and the modal on wide.

---

## Handoff notes for `frontend`

### Thumbnail data source

- Backend extracts a frame at recording end: `data/thumbnails/<recordingId>.jpg`
- Surface via `GET /api/recordings/:id` response field `thumbnailUrl: string | null`
- `thumbnailUrl` is `null` while status is `recording`, `pending`, or `failed`
- Frontend: render the `<img src={thumbnailUrl}>` only when non-null; fall back to the gradient placeholder div (channel callsign + gradient) if null or 404
- Implication: the recording status state machine needs a `thumbnail-ready` sub-state (or the frontend polls until `thumbnailUrl` is non-null after transition to `completed`). Backend may want to emit a `thumbnail` background job on the `completed` transition and set `thumbnailUrl` once the job finishes — this means completed items can briefly appear without a thumbnail. The mock uses the placeholder for this gap.

### Monospace font stack

```css
font-family: "JetBrains Mono", "Fira Code", "Menlo", "Consolas", ui-monospace, monospace;
```

Apply at the root. Japanese characters fall back to system UI since the mono stack does not include CJK glyphs — acceptable at small sizes.

### Status chip grammar

| Code   | CSS class     | Color var         | Use on                        |
|--------|---------------|-------------------|-------------------------------|
| `SCHED`| `.chip-sched` | `--warning`       | pending reservations          |
| `REC`  | `.chip-rec`   | `--destructive`   | recording-now + pulsing dot   |
| `DONE` | `.chip-done`  | `--success`       | completed with thumbnail      |
| `FAIL` | `.chip-fail`  | `--destructive/0.8`| failed + log-tail drawer      |

All chips: `border-radius: 3px` (square), `font-size: 0.625rem`, `font-weight: 700`, border on all sides.

### Shadcn primitives

| UI element               | Shadcn primitive                          |
|--------------------------|-------------------------------------------|
| Tab bar                  | `Tabs` (`TabsList` + `TabsTrigger`)       |
| Status chips             | `Badge` (custom variant per status code)  |
| Completed thumb card     | `Card` (`CardContent`)                    |
| Reservation form (mobile)| `Sheet` (side=bottom)                     |
| Reservation form (desktop)| `Dialog` (command-palette layout)        |
| Delete confirmation      | `AlertDialog`                             |
| Channel / time inputs    | `Input`, `Select`                         |
| Form validation          | `Form` (react-hook-form)                  |
| Toast on success/failure | `sonner`                                  |
| Disk usage               | `Progress`                                |
| Log-tail drawer          | `Collapsible` (`CollapsibleTrigger` + `CollapsibleContent`) |
| Scroll areas             | `ScrollArea`                              |

### Tailwind tokens

- `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`
- `border-border`, `ring-ring` (focus: `ring-2 ring-ring ring-offset-2`)
- Custom CSS vars (add to theme extension, do NOT use raw Tailwind color names):
  ```
  --success:  142 70% 46%  (dark) / 142 70% 38%  (light)
  --warning:  38  92% 50%  (dark) / 38  92% 46%  (light)
  ```

### Interactive states

- Row hover: `bg-muted/40`
- Card hover: `bg-muted/35`
- Focus-visible: `outline-2 outline-ring outline-offset-3 rounded-sm` on every button / card / tab
- REC dot: CSS keyframe `opacity 1→0.35→1` at 1.4s, `prefers-reduced-motion` disables
- Recording progress bar: `bg-destructive` fill, same animation
- Tab count badge: TanStack Query invalidation on any recording mutation
- Thumb progress bar: `bg-primary` fill, static (pulled from `watchedSec / durationSec`)
- Watched ribbon: absolute positioned corner triangle, `bg-success/0.85`

### Form behaviour

- EPG search: debounced `GET /api/programs?q=&serviceId=`; results grouped by date; selecting auto-fills `startAt` / `endAt`
- Conflict check: client-side overlap against `pending` + `recording` schedules before submit; server also validates
- Validation chips: inline `OK` / `ERR` per field, not below — reduces layout shift
- On success: invalidate `['recordings']` query, close sheet/modal, `sonner` toast "予約しました"
- On delete: `AlertDialog` confirm → `DELETE /api/recordings/:id` → invalidate → toast

### Open questions

- Thumbnail polling vs server-sent event: should frontend poll `GET /api/recordings/:id` until `thumbnailUrl` is non-null after `completed`, or does the backend push a WS/SSE event when the thumbnail job finishes? SSE preferred to avoid polling.
- Playback route: does clicking a completed card navigate to `/recordings/:id` (full page) or open an inline overlay player? Affects Card semantics (`<a>` vs `<button>`).
- Recurring reservations (`毎週` toggle): not in Phase 4 scope but the form field-group layout has room for it without redesign.
- Disk usage endpoint (`GET /api/storage/stats`) is Phase 6 — the v11 disk bar and the storage figure in v10/v12 render as placeholder until then.

## Chosen variant

**v10 — sectioned single-column feed + command-palette modal form** (confirmed by user 2026-04-17).

Designer recommended v12 (tabs + dual-density + bottom-sheet). User picked v10. Implementation implications:

- **Single vertical scroll on desktop** — sections in order: REC NOW / SCHED / FAIL / DONE. All four statuses visible at once without tab switching; the DONE thumbnail grid lives at the bottom.
- **Mobile adaptation not yet specified** — v10 is desktop-first. Likely fall-back: collapse the top three sections into pinned sticky headers with their rows scrolling, and let the DONE grid become a 2-column tile grid below. Lock this before the recordings PR starts.
- **Command-palette modal form** (EPG search grouped by date, one-click reserve + a manual entry section with inline `OK` / `ERR` chips). This is the fastest reservation flow — matches "パッと入力". Bind to a global shortcut (⌘K or 新規予約 button) on the screen.
- **Section ordering rationale** — REC NOW and FAIL first because they need attention; SCHED next (user's queue); DONE at bottom (archive / browse). This is intentionally the inverse of a chronological feed.
- **Thumbnail handling** — only `DONE` cards show thumbnails. SCHED/REC/FAIL remain text-dense (no fake thumbnails). Backend signals: `thumbnailUrl: null | string` on `Recording`, with an async frame-extraction job emitting a `thumbnail-ready` event — prefer SSE over polling.
- **Disk usage row** at the bottom of the DONE section — placeholder until Phase 6 exposes `GET /api/storage/stats`.
