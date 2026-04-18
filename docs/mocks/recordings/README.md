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

## Variants

### v1 — Grouped-section flat list + Modal form
- Layout: vertical list sectioned by status (録画中 / 予約済み / 完了 / 失敗); left-edge stripe for colour coding
- Form: centred `Dialog` overlay (channel → program search → start/end datetime)
- Trade-off: most familiar pattern, easy to scan mixed states; modal requires focus trap management; modal blocks the list context

### v2 — Monthly Calendar view + Side Drawer form
- Layout: calendar grid (month view) with colour-coded event chips per day; clicking a day shows detail strip below calendar; toggle to list view
- Form: right-side `Sheet` (280px) with EPG autocomplete dropdown + conflict warning
- Trade-off: best "when is what scheduled" spatial overview; terrible for >3 items per day; mobile calendar cells shrink too small without special layout (uses mini dot-per-day fallback); drawer form has good context preservation

### v3 — Filtered Tabs list + Bottom Sheet form (mobile-first)
- Layout: underline tab bar (すべて / 予約済み / 録画中 / 完了 / 失敗) with live badge counts; dense 1-line rows with left stripe; tab count badges are colour-coded by status
- Form: bottom `Sheet` that slides up; full-width footer buttons; same component on desktop at wider max-width
- Trade-off: best mobile ergonomics; tab counts give quick overall status; bottom sheet maps well to touch; desktop users lose spatial separation of pending/done because everything is in one scrollable list under a tab; "all" tab shows all four statuses at once (requirement met)

### v4 — Card Grid list + Full-page Stepper form
- Layout: active recording shown as full-width strip; pending/completed/failed shown as thumbnail cards in a 3-col (desktop) / 2-col (mobile) grid; section headers per status group
- Form: navigates to a dedicated full-page 3-step form (channel → time/EPG → confirm); stepper component with "back" navigation
- Trade-off: visually richest, good for "media library" feel; card grid wastes space when titles are long; stepper requires 3 interactions before saving (highest friction); best for complex reservations (e.g. recurring); stepper is poor for quick scheduling

### v5 — Date-grouped Timeline list + Inline Expanding form
- Layout: vertical timeline grouped by calendar day (日 pill headers); each item has a time axis on the left and a mini card on the right; "add" trigger card at the bottom of any day group expands inline
- Form: inline expand within the list — channel/program/time inputs appear inside a dashed card without leaving the list; "add globally" dashed card at bottom
- Trade-off: best temporal narrative — you see past + present + future in one scroll; inline form means zero navigation cost for adding; risk: long list + open form pushes content far down; on mobile the time labels compress nicely; unique trade-off not covered by other variants

### v6 — Two-column Sidebar layout + EPG Search Command-Palette Modal
- Layout (desktop): left column = active recording strip + completed + failed; right sidebar = upcoming reservations list + disk usage widget; left is the "archive", right is the "queue"
- Form: command-palette style `Dialog` (full-width search input at top, scrollable EPG results by date group, channel quick-filter chips, single-click-to-reserve for EPG result, manual datetime entry option at bottom)
- Trade-off: most information-dense desktop layout; sidebar with queue vs archive split matches mental model of "I want to check what's coming up" vs "I want to find a recording to play back"; EPG search modal is the fastest reservation flow (1 search + 1 click); mobile collapses to single column with tabs; disk usage widget fits naturally in sidebar

## Recommendation

**List: v3 (Filtered Tabs)**  
**Form: v6 (EPG Search Modal / command-palette)**

Combined justification: v3's tab bar is the most intuitive pattern on both mobile and desktop — users can instantly filter to "予約済み" or "録画中" without the cognitive overhead of a calendar (v2) or scrolling a combined timeline (v5). The left stripe + pill badge system satisfies the "status at a glance" requirement at minimal visual cost. The tab approach also maps directly to Shadcn `Tabs` primitive.

For the form, v6's command-palette approach is the fastest path from intent to saved reservation: type a few characters, see EPG matches grouped by date, click once to reserve. This aligns with "パッと入力、たまに見返す" — the reservation flow should take under 5 seconds for a program the user has already identified. The centred modal doesn't require extra navigation state (unlike the stepper in v4) and doesn't hide the list context for a full page (unlike v4's full-page form).

The drawer from v2 is the second choice for the form if EPG search query latency is a concern — it keeps the list visible for orientation.

## Handoff notes for `frontend`

### Shadcn primitives

| UI element | Shadcn primitive |
|---|---|
| Filter bar | `Tabs` (with `TabsList` + `TabsTrigger`) |
| Status badges | `Badge` (variant + custom colour class) |
| Reservation modal | `Dialog` (with `DialogContent`, `DialogHeader`, `DialogFooter`) |
| Delete confirmation | `AlertDialog` |
| Channel/time inputs | `Input`, `Select` |
| Form validation | `Form` (react-hook-form wrapper) |
| Toast on success/failure | `sonner` |
| Disk usage (v6) | `Progress` |
| Drawer variant (v2 alt) | `Sheet` (side=right) |
| Bottom sheet variant (v3) | `Sheet` (side=bottom) |

### Tailwind tokens to carry forward

- `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`
- `border-border`, `ring` (focus ring: `ring-2 ring-ring ring-offset-2`)
- Status colour pattern (not Shadcn tokens, custom): keep the HSL values defined in CSS vars for pending/recording/completed/failed — do not use raw Tailwind amber/green/red because they won't track the dark mode shift

### Status colour system (carry into Tailwind theme extension)

```
--status-pending:   38 92% 52%     (amber)
--status-recording: 0  72% 58%     (red, pulsing dot)
--status-completed: 142 70% 40%    (green)
--status-failed:    0  50% 40%     (muted red)
```

### Interactive states to implement

- Hover: `bg-muted/40` on list rows
- Focus-visible: `outline-2 outline-ring outline-offset-2 rounded` on every button/link/tab
- Active recording dot: CSS `animation: pulse` (keyframe opacity 1→0.5→1, 1.5s)
- Progress bar (recording): red fill, same pulse animation
- Tab count badge: updates live via TanStack Query invalidation

### Form behaviour notes

- EPG search: debounced query to `GET /api/programs?q=...&serviceId=...`; results grouped by date; selecting a result auto-fills `startAt` + `endAt`
- Conflict warning: check existing `pending`/`recording` schedules for time overlap client-side before submit (server also validates)
- Validation: `startAt` must be in the future; `endAt` > `startAt`; channel required
- On success: invalidate `['recordings']` query, close modal, toast "予約しました"
- On delete: `AlertDialog` confirm → `DELETE /api/recordings/:id` → invalidate → toast

### Open questions

- Should the "completed" recordings link directly to a playback route (`/recordings/:id`) or open an inline player (like the live player)? This affects whether `Card` items have a play button or are fully clickable.
- Recurring reservations (e.g. every week) are not in Phase 4 scope — but the form should have space for a "毎週" toggle without a full redesign.
- The disk usage widget in v6's sidebar — Phase 4 does not have a storage health endpoint yet (Phase 6). The widget can render as static/placeholder until then.

## Chosen variant

_(Pending user selection — v3 list + v6 modal form is the designer recommendation)_
