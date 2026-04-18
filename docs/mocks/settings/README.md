# Mock: Settings Screen

## Goal

Let the user glance at server health and change a small number of preferences
(theme, live quality) in one brief visit.  Diagnostic data (mirakc, ffmpeg,
postgres, disk) must be immediately scannable without interaction.  Interactive
settings must be visually distinct from read-only diagnostic surfaces.

---

## Legacy direction (v1–v5)

Deprecated 2026-04-17.  Designer-recommended variant was v4 (Card Grid) but it
was never adopted by the frontend team.  The v1–v5 files are preserved for
reference; do not delete them.

Key difference from the current direction: v1–v5 used a conventional settings
aesthetic (icons, rounded pills, "読み取り専用" badge stamps).  They did not
differentiate diagnostic surfaces typographically — everything used the same
system font.

---

## Current direction (v10+)

**Philosophy**: settings in this app is majority diagnostic (HW accel, server
health, disk, versions) and minority interactive (theme, quality).  The new
family adopts a "status console" register for diagnostic surfaces — monospace
key-value pairs, square status chips, inline log tails — and reserves a
non-monospace, action-oriented register exclusively for the two interactive rows.
The contrast is the primary UI signal: *glanceable what is tunable vs what is
information-only*.

### Chip vocabulary (all square corners, `border-radius: 2px`)

| Code | Color | Use |
|---|---|---|
| `OK` | success green | subsystem healthy |
| `WARN` | amber | degraded / threshold crossed |
| `ERR` | destructive red | connection error / subsystem down |
| `FATAL` | destructive red, bold | process crash |
| `BOOTING` | primary blue | subsystem initializing |

---

## Constraints / inputs

- Route: `/settings` (TanStack Router file-based)
- User-tunable settings:
  - Theme: `light` / `dark` / `system` — square segmented control (NOT `Switch`)
  - Live quality preset: `auto` / `high` / `medium` / `low` — square segmented control
- Read-only diagnostic (never interactive):
  - `mirakc` — version, last poll time, tuner availability
  - `ffmpeg` — version, hw_accel type, active sessions
  - `postgres` — version, connection count, latency
  - `disk` — free/total, usage %, paths, progress bar (square)
  - `server` — bun/hono versions, uptime, rss memory
- About: version, git sha, built timestamp, license link
- App philosophy: "パッと入力、たまに見返す" — one-glance scannable, no engagement loops
- tvOS/FireTV: every interactive element reachable by D-pad; diagnostic rows
  NOT focusable unless they carry a log-tail toggle

---

## Variants

### v10 — Status Console Scroll

Single-page scroll.  Diagnostic rows are flat lists grouped into three section
blocks (STREAMING / STORAGE / RUNTIME).  Interactive settings follow below as a
distinct card using `font-family: system-ui` — the font-family contrast is
immediately apparent.  WARN state (disk) auto-expands its log tail via
`<details open>`.

- Layout: single column, max-width 760 px, works naturally on 390 px mobile.
- Trade-off: simplest navigation (no tabs, no sidebar); all diagnostic data
  visible on first scroll.  Desktop wastes some horizontal space.  Interleaving
  diagnostic and interactive sections in one linear flow risks visual confusion
  if more interactive settings are added later.

### v11 — Two-Column Split (Left Nav + Right Pane)

Fixed 200 px left sidebar with per-subsystem nav items, each showing its own
status chip.  Right pane scrolls independently.  Each subsystem gets its own
`Card` with a KV table and collapsible log tail.  Non-OK subsystem
(mirakc ERR + disk WARN) visible at a glance in the nav.

- Layout: two-column on desktop, collapses to horizontal scrollable strip on
  mobile ≤ 600 px.
- Trade-off: best for navigating directly to a failing subsystem.  Clearest
  separation: left nav = diagnostic health summary, right pane = detail.  More
  structural complexity; overkill if the settings screen stays small.

### v12 — Tabbed + Pinned Health Strip  ← RECOMMENDED

Three tabs: `ステータス` / `表示設定` / `About`.  A slim health strip is
pinned below the global header and above the tab bar — always visible regardless
of which tab is active.  Health strip shows one chip + one key reading per
subsystem in a horizontal scrollable row.  Inside the `ステータス` tab, the
diagnostic layout uses the chip-in-left-column pattern (chip column / KV content
column).  Non-OK state (disk WARN) auto-expands log tail.  `表示設定` tab is
entirely non-monospace, making the contrast unambiguous.

- Layout: full-height app shell; health strip + tab bar sticky; content pane
  scrolls.  Works at 390 px and 1440 px.
- Trade-off: pinned health strip gives ambient awareness of system status without
  cluttering the settings content.  Tabs allow the interactive settings to live
  in a completely separate visual context.  Requires tab switching to reach
  settings from status, but the health strip mitigates the "blind spot" problem.

---

## Recommendation

**v12** — Pinned health strip solves the core tension: the user can see all
subsystem statuses at a glance (the strip), then act on interactive settings (the
`表示設定` tab) without the two surfaces fighting for space.  The tab separation
also gives a clean extension point for future settings without making the
diagnostic view noisier.  The font-family contrast (monospace in `ステータス`,
`font-family: system-ui` in `表示設定`) is the most legible signal in the entire
family for "this is diagnostic / this is tunable."

---

## Handoff notes for `frontend`

### Data sources

All diagnostic data comes from a single `GET /api/health` endpoint (Phase 6
plan).  Shape agreed:

```ts
interface HealthResponse {
  mirakc:   { status: 'ok' | 'err'; version: string; lastPoll: string; tunersAvailable: number; tunersTotal: number; };
  ffmpeg:   { status: 'ok' | 'err'; version: string; hwAccel: 'nvenc' | 'qsv' | 'vaapi' | 'none'; activeSessions: number; maxSessions: number; };
  postgres: { status: 'ok' | 'err'; version: string; connections: number; maxConnections: number; latencyMs: number; };
  disk:     { status: 'ok' | 'warn' | 'err'; freeBytes: number; totalBytes: number; recordingBytes: number; hlsTmpBytes: number; path: string; };
  server:   { uptimeSeconds: number; memRssBytes: number; bunVersion: string; honoVersion: string; };
}
```

**Disk breakdown** (`recordingBytes` vs `hlsTmpBytes`) requires the backend to
run `du` on the recordings directory and the HLS tmpfs mount.  This is work the
backend has not scoped yet — flag it before Phase 6 implementation starts.  As a
fallback, `disk.freeBytes` / `disk.totalBytes` are obtainable via `statvfs`
without `du`, so the progress bar and WARN threshold can ship first.

Each subsystem also needs recent log lines exposed: suggest
`GET /api/health/logs?subsystem=disk&limit=5` returning `{ ts: string; level:
'info'|'warn'|'err'; msg: string }[]` for the inline log tail.  This is a
separate endpoint — not in `GET /api/health` itself.

### TanStack Query wiring

```ts
useQuery({
  queryKey: ['health'],
  queryFn: () => hc.health.$get().json(),
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,   // pause when tab hidden
})
```

Log tails: separate query, `enabled: subsystem.status !== 'ok'` — only fetch
when non-OK to avoid unnecessary polling.

### Shadcn primitives

| Surface | Primitive |
|---|---|
| Diagnostic card per subsystem | `Card` — no interaction |
| Status chip | `Badge` with custom monospace className; square via `rounded-[2px]` |
| Progress bar | plain `div` with `rounded-none`; Shadcn `Progress` sets `rounded-full` by default — override required |
| Theme segmented control | `ToggleGroup` / `RadioGroup` wrapped in `div` with square border |
| Quality segmented control | same as theme |
| Log tail toggle | Shadcn `Collapsible` + `CollapsibleTrigger` |
| Tab bar | Shadcn `Tabs` + `TabsList` / `TabsTrigger` / `TabsContent` |
| Health strip | custom — sticky `div` with flex row, Shadcn `Badge` per subsystem |
| About links | `a` with standard Shadcn link style |

### Monospace font stack

```css
font-family: "JetBrains Mono", "Fira Code", "Menlo", "Consolas", ui-monospace,
             system-ui, -apple-system, "Hiragino Sans", sans-serif;
```

Apply on `.dark body` for diagnostic panels.  Override to
`font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;` on the
interactive section container.

### Tailwind tokens

```
bg-card          text-card-foreground
bg-muted         text-muted-foreground
border-border    ring
bg-primary       text-primary-foreground
```

Custom CSS vars to add (already in the mocks):
- `--success: 142 70% 46%` (dark) / `142 70% 38%` (light)
- `--warning: 38 92% 50%` (dark) / `38 92% 46%` (light)

### Focus / interactive states

- Segmented control buttons: `focus-visible:outline-2 outline-ring outline-offset-[-2px] rounded-[1px]`
- Tab triggers: same pattern
- Log tail `CollapsibleTrigger`: standard `focus-visible` ring
- Diagnostic rows: `tabIndex={-1}` on the row container; only the
  `CollapsibleTrigger` inside a WARN/ERR row is focusable
- About links: standard Shadcn link focus ring

### Open questions

1. Should theme preference persist to server (user preference table) or stay in
   `localStorage` only?
2. Should quality preset be per-user or per-device?
3. Disk `du` for recordings breakdown — backend scope not confirmed for Phase 6.
4. Log tail endpoint (`GET /api/health/logs`) — not in Phase 6 plan; may need
   to be added or deferred.
5. Should the health strip refresh independently (30 s) even when the user is on
   the `表示設定` tab?  Current recommendation: yes, but pause when the entire
   settings route is unmounted.
