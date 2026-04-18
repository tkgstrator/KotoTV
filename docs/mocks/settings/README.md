# Mock: Settings Screen

## Goal

Let the user glance at their current preferences and change a small number of
values (theme, live quality) in one brief visit.  Diagnostic info (HW accel,
storage, server health) must be immediately readable without any interaction.

## Constraints / inputs

- Route: `/settings` (tentative, TanStack Router file-based route)
- User-tunable settings:
  - Theme: light / dark / system (`RadioGroup` or segmented control)
  - Live quality preset: auto / high / medium / low (`Select`)
- Read-only diagnostic items (never interactive):
  - HW accel type — sourced from `GET /api/health` response field
    `hwAccel: "nvenc" | "qsv" | "vaapi" | "none"`
  - Recording storage — `GET /api/health` → `storage: { used, total, path }`
  - Server health — `GET /api/health` → `services: { mirakc, postgres }` each
    `"up" | "down"`
- About: version string (build-time constant), GitHub link, license
- App philosophy: "パッと入力、たまに見返す" — rare visit, one-glance scannable
- tvOS/FireTV compatibility: all interactive elements must be keyboard/D-pad
  reachable with visible `focus-visible` rings; no hover-only affordances

## Variants

### v1 — Single-column scroll

- Layout idea: iOS-style grouped sections stacked vertically, anchored
  section headings with uppercase labels. Diagnostic section is visually
  separated by a dashed border + muted background.
- Trade-off: dead-simple on mobile, zero JavaScript for navigation. Desktop
  feels slightly narrow and wastes horizontal space.

### v2 — Tabbed / Segmented (desktop-friendly)

- Layout idea: horizontal tab bar (テーマ / 画質 / 診断 / About) above a
  single content pane. Each tab reveals exactly one category.
- Trade-off: clean desktop layout, hides diagnostic info behind a tap. Users
  who just want server health have to switch tabs — one extra action. Good
  focus-order (tab bar → panel).

### v3 — Left-nav + Content Pane (macOS/desktop split)

- Layout idea: persistent 220 px left sidebar with nav items grouped into
  sections; right content pane scrolls independently. On narrow viewports
  the sidebar collapses to a horizontal scrollable strip.
- Trade-off: familiar desktop pattern, expands well to 1440 px. Overkill for
  a ~6-item settings screen; adds structural complexity with little gain.

### v4 — Card Grid

- Layout idea: every setting group is its own `Card`. User-tunable cards use
  full-color icon; diagnostic cards use muted icon + dashed border + a
  "読み取り専用" badge stamped in the top-right corner. Responsive 1→2→3
  column grid.
- Trade-off: highest at-a-glance density — you see all settings simultaneously
  without any navigation. The `::before` "read-only" stamp is the clearest
  diagnostic-vs-editable distinction of all variants. On narrow mobile
  (1-column) it degrades to a scroll like v1 but with larger cards.

### v5 — Mobile-native Sub-pages (iOS-ish)

- Layout idea: a root list with row-level chevrons navigates into full-screen
  sub-pages via CSS transform slide animation. Diagnostic rows have no
  chevron and `pointer-events:none`, making them visually and operationally
  inert.
- Trade-off: best mobile ergonomics and the sharpest diagnostic-vs-interactive
  distinction (no chevron = not tappable — universally understood). Extra
  navigation cost for desktop users; sub-page model is awkward when there
  are only 2 editable settings.

## Recommendation

**v4 — Card Grid**

Reasons:

1. "One-glance scannable" aligns directly with the card grid — every setting
   group is visible on the initial render, no tab-switching or scrolling needed
   on a typical desktop viewport.
2. The `::before` "読み取り専用" badge on diagnostic cards is the most explicit
   diagnostic-vs-editable signal across all variants.  There is zero ambiguity:
   muted icon + dashed border + badge = "look, don't touch".
3. Responsive grid degrades cleanly to mobile without a layout mode switch.
4. tvOS/FireTV spatial nav is straightforward: D-pad moves focus across cards
   in a predictable grid order.

Concern addressed: on v4 the diagnostic cards still contain interactive-looking
elements (progress bars, status rows).  The dashed border + muted icon colour +
`::before` stamp together handle this, but the frontend implementer should also
set `tabIndex={-1}` and `aria-disabled` on the diagnostic card containers so
screen-readers and keyboard users never land focus inside them.

## Handoff notes for `frontend`

### Shadcn primitives

| UI element | Shadcn primitive |
|---|---|
| Theme selector | `RadioGroup` + `RadioGroupItem` inside `Card` |
| Quality picker | `Select` + `SelectTrigger` / `SelectContent` / `SelectItem` |
| Diagnostic cards | `Card` (`variant="outline"`) — no Shadcn interaction |
| Storage bar | Plain `div` with Tailwind; Shadcn `Progress` is an option |
| Health badges | `Badge` (`variant="outline"`) — green/red via custom `className` |
| HW accel tag | `Badge` (`variant="secondary"`) with `font-mono` |
| About phase tag | `Badge` (`variant="outline"`) |
| Section headers | Typography only — no primitive needed |

### Tailwind tokens to use

```
bg-card          border-border      text-card-foreground
bg-muted         text-muted-foreground
text-primary     ring                bg-primary
```

For diagnostic cards add a custom class that composes:
`bg-muted/30 border border-dashed border-border rounded-xl`

### Focus / interactive states

- Theme `RadioGroupItem`: `focus-visible:ring-2 ring-ring ring-offset-2`
- Quality `SelectTrigger`: standard Shadcn focus ring
- Diagnostic `Card`: `tabIndex={-1}` — must NOT receive focus
- GitHub link in About: standard link `focus-visible` ring

### Data sources (Phase 6 plan)

| Field | Endpoint | Shape |
|---|---|---|
| `hwAccel` | `GET /api/health` | `"nvenc" \| "qsv" \| "vaapi" \| "none"` |
| `storage.used`, `storage.total`, `storage.path` | `GET /api/health` | bytes |
| `services.mirakc`, `services.postgres` | `GET /api/health` | `"up" \| "down"` |
| Version string | build-time constant / `import.meta.env.VITE_APP_VERSION` | string |

Health data should be fetched with TanStack Query, key `["health"]`,
`refetchInterval: 30_000`.

### Open questions

- Should theme preference be persisted to the server (user preference table) or
  stay in `localStorage` only?
- Should the quality preset be per-user or per-device?
- Is there a "reset to defaults" action needed in Phase 6 scope?
