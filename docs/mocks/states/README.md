# Mock: Cross-Screen State Patterns

## Goal

Lock a shared visual grammar for loading, error, empty, toast, and offline states so every screen (channel list, EPG, live player, recordings, settings) speaks the same language. The implementer (`frontend`) applies these tokens and component shapes directly without making per-screen decisions.

App philosophy: "パッと入力、たまに見返す" — states must be unobtrusive. One clear line, one clear action. No lecture copy, no upsell.

## Constraints / inputs

- Shadcn primitives: `Skeleton`, `Alert`, `Toast` / `Sonner`, `Button`, `Badge`, `Progress`
- Shadcn CSS var tokens: `destructive` (fatal), `primary` (action/info), `muted` (secondary), `success` (custom, mapped from `hsl(142 70% 48%)` dark / `hsl(142 70% 40%)` light), `warning` (custom, `hsl(38 92% 52%)` dark)
- No `#000` / `#fff` anywhere — all colours use `hsl(var(--*))` references
- `prefers-reduced-motion`: skeleton shimmer and spinners must degrade gracefully (shimmer → static opacity; spinner → border-only with no rotation)
- Focus rings: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px` on every interactive element
- ARIA: `role="alert" aria-live="assertive"` for errors; `role="status" aria-live="polite"` for success/info toasts and banners; `aria-label` on icon-only close buttons

## Variants

### v1 — Clinical Minimal

- Tone: neutral, no icons on empty states (Lucide SVGs only on errors), plain dot badge on toasts, sharp border-radius (4–8px), `border-style: dashed` on empty-state cards
- Iconography: Lucide SVG only — no emoji
- Action placement: inline button flush right on alerts, centred below text on empty/fatal states
- Color strategy: neutral-dominant; status colour appears only on destructive/warning accents and progress fills, not as background floods
- Trade-off: maximally approachable for technical users; potentially reads as too sparse for general audiences

### v2 — Friendly Conversational

- Tone: warmer, rounded corners (10–12px), pill buttons (border-radius: 9999px), emoji accent on empty states and offline banners, icon-in-circle badge on Sonner toasts (similar to shadcn/sonner style)
- Iconography: Lucide SVG for errors + emoji accent (📼 📡 🔍 📶 📺) for empty/fatal states
- Action placement: primary action centred below copy on empty/fatal; inline retry button on alert rows; undo link inside success toast
- Color strategy: status-colour-forward icons in circular badges (green checkmark, red X, blue i); backgrounds remain neutral
- Trade-off: most welcoming for general audiences; emoji in code requires careful rendering budget and i18n review

### v3 — Diagnostic Dense

- Tone: monospace font (JetBrains Mono fallback), square corners (3–6px), status-code badges (OK / ERR / WARN / INFO / OFFLINE / FATAL), inline log lines on transcoder startup and fatal errors
- Iconography: none — text codes only; coloured left-border accents on alert cards
- Action placement: inline RETRY / UNDO buttons in the toast; log-detail block inside fatal errors before the action buttons
- Color strategy: colour appears as status-code badge fill + 3px left border on cards; backgrounds are `muted/0.08` washes — very restrained
- Trade-off: excellent for developers and power users who want to understand what went wrong; overwhelming for non-technical users; not recommended as the production default but good as a developer-mode overlay

## Recommendation

**v1** — because:

1. The channel list and EPG are data-dense screens; state patterns must not add visual noise. v1's neutral-dominant palette keeps state UI from competing with content.
2. Lucide-only iconography is already established by the channel list (v6-tvguide) and live player (v2) mocks. Introducing emoji in v2 would break consistency with those existing screens.
3. The dashed-border empty cards and dot-badge toasts translate directly to Shadcn `Skeleton`, `Alert`, and `Sonner` primitives with minimal custom CSS — reducing frontend implementation surface.
4. Accessible focus rings and ARIA roles are identical across all three variants; v1 is not a downgrade in accessibility.
5. v3's monospace density is valuable during development (consider shipping it as a collapsible debug panel in fatal errors rather than as the default user-facing state).

## Handoff notes for `frontend`

### Shadcn primitives mapping

| State | Shadcn primitive | Notes |
|-------|-----------------|-------|
| Skeleton loading | `Skeleton` | Use `animate-pulse` class; override with `prefers-reduced-motion` media query |
| Spinner | custom `div` + CSS | No Shadcn spinner; use the pattern from v1/v3. 20px, 2px border, `border-top-color: primary` |
| Progress bar | `Progress` | Indeterminate: CSS keyframe on inner `div`; determinate: controlled `value` prop |
| Inline error/warning | `Alert` + `AlertDescription` | `variant="destructive"` for errors; custom `variant="warning"` using `--warning` token |
| Fatal full-screen | `Alert` inside a centred flex wrapper | Not a modal — replaces the content area |
| Toast success/error/info | `Sonner` (via `sonner` package) | Position: `bottom-right`. Use `toast.success()`, `toast.error()`, `toast.info()`. For undo: `toast.success("...", { action: { label: "元に戻す", onClick } })` |
| Empty state | custom `div` | Dashed border: `border border-dashed border-border`. Centred flex column. Lucide icon above heading |
| Offline banner | custom `div` | Sticky top or appended just below `<header>`. `role="status" aria-live="polite"` |

### CSS custom properties (add to `globals.css`)

```css
:root {
  --success: 142 70% 40%;
  --warning: 38 92% 48%;
}
.dark {
  --success: 142 70% 48%;
  --warning: 38 92% 52%;
}
```

### Tailwind token reference

| Role | Token |
|------|-------|
| Skeleton fill | `bg-muted` |
| Skeleton shimmer | custom `::after` gradient (see v1.html) |
| Error fill (inline) | `bg-destructive/10 border-destructive/25` |
| Error text | `text-destructive` |
| Warning fill | `bg-[hsl(var(--warning)/0.1)] border-[hsl(var(--warning)/0.3)]` |
| Success dot / icon | `text-[hsl(var(--success))]` |
| Primary spinner ring | `border-primary` (top) + `border-muted` (rest) |
| Progress fill | `bg-primary` (normal) · `bg-destructive` (urgent ≥90%) |
| Dashed border | `border border-dashed border-border` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Toast shadow | `shadow-lg` |
| Offline banner (offline) | `bg-[hsl(var(--warning)/0.1)] border-b border-[hsl(var(--warning)/0.25)]` |
| Offline banner (slow) | `bg-primary/8 border-b border-primary/20` |
| Offline banner (back online) | `bg-[hsl(var(--success)/0.1)]` |

### Spinner pattern (copy-ready)

```tsx
// components/ui/spinner.tsx
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 rounded-full border-2 border-muted border-t-primary",
        "motion-safe:animate-spin",
        className
      )}
      role="status"
      aria-label="読み込み中"
    />
  )
}
```

### Skeleton pattern (channel row)

```tsx
// Use Shadcn Skeleton directly
<div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
  <Skeleton className="h-3.5 w-8" />
  <div className="flex-1 flex flex-col gap-1.5">
    <Skeleton className="h-3 w-4/5" />
    <Skeleton className="h-2.5 w-1/2" />
    <Skeleton className="h-[3px] w-full" />  {/* progress bar row */}
  </div>
  <div className="flex flex-col gap-1.5">
    <Skeleton className="h-2.5 w-16" />
    <Skeleton className="h-2.5 w-10" />
  </div>
</div>
```

### Empty state pattern

```tsx
function EmptyState({ icon: Icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-8 text-center
                    border border-dashed border-border rounded-lg">
      {Icon && <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />}
      <p className="text-sm font-semibold mt-1">{heading}</p>
      {body && <p className="text-xs text-muted-foreground max-w-[200px]">{body}</p>}
      {action}
    </div>
  )
}
```

### Fatal error pattern

```tsx
function FatalError({ heading, body, onBack, onRetry }: FatalErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3
                    min-h-[200px] px-6 py-10 text-center">
      <XCircle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="text-base font-bold">{heading}</p>
      {body && <p className="text-sm text-muted-foreground max-w-[260px]">{body}</p>}
      <div className="flex gap-2 mt-1">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> 戻る
          </Button>
        )}
        {onRetry && <Button onClick={onRetry}>再試行</Button>}
      </div>
    </div>
  )
}
```

### Toast (Sonner) configuration

```tsx
// Root layout — position and styling
<Toaster
  position="bottom-right"
  toastOptions={{
    classNames: {
      toast: "font-sans text-sm border border-border shadow-lg rounded-lg",
      success: "border-border",
      error: "border-destructive/40",
    },
    duration: 4000,
  }}
/>
```

```tsx
// Usage examples
toast.success("予約を保存しました")
toast.error("削除に失敗しました", {
  action: { label: "再試行", onClick: () => retry() }
})
toast.info("録画が間もなく開始されます")
toast.success("予約を削除しました", {
  action: { label: "元に戻す", onClick: () => undo() }
})
```

### ARIA / accessibility rules

| Component | Role | aria-live | Notes |
|-----------|------|-----------|-------|
| Error toast | `role="alert"` | `aria-live="assertive"` | Interrupts screen reader |
| Success/info toast | `role="status"` | `aria-live="polite"` | Waits for idle |
| Inline alert (error) | `role="alert"` | — | Sonner handles live region |
| Offline banner | `role="status"` | `aria-live="polite"` | Top of DOM, after `<header>` |
| Spinner | `role="status"` | — | `aria-label="読み込み中"` |
| Close button (×) | `<button>` | — | `aria-label="閉じる"` |
| Empty state heading | `<p>` or `<h2>` | — | If inside a `<section>`, use `<h2>` |

### When to use each pattern

| Scenario | Pattern |
|----------|---------|
| Initial data fetch (channels, recordings list) | Skeleton — show the shape of what will appear |
| User-triggered action (save, delete, retry) in progress | Spinner inline with the triggering element |
| Transcoder startup (>1s wait) | Spinner + Progress (determinate if phases known) |
| No data at all (empty list) | Empty state with dashed border + one primary action |
| Soft network error (retryable) | Inline `Alert` with Retry button flush right |
| Unrecoverable in-context (wrong password, missing file) | Inline `Alert destructive` + navigate-away option |
| Playback impossible | Fatal full-screen: heading + muted body + Back + Retry |
| Async mutation complete | Toast success (4s auto-dismiss) |
| Async mutation failed | Toast error with Retry action (persistent until dismissed) |
| Undo-able action completed | Toast success with undo link (8s auto-dismiss) |
| Network offline | Offline banner below `<header>`, sticky |
| Network slow / degraded | Info banner, same position |
| Network restored | Success banner, auto-dismiss after 3s |

### Missing patterns (not yet covered — implement when needed)

- **Confirmation dialog** — "本当に削除しますか？" destructive action gate. Use Shadcn `AlertDialog` (not inline Alert). Trigger from trash / delete buttons. Not needed for Phase 6 but required before any destructive API call ships.
- **Form validation** — inline field-level error text (below `<Input>`). Use Shadcn `FormMessage`. Not in this pattern lib because forms are settings-screen-specific.
- **Pagination / load-more** — recordings list may grow beyond one page. Considered a list state, not an error/empty state; implement as a `Button variant="outline"` at list end.
- **Optimistic UI rollback** — when an optimistic update fails, the list snaps back. The toast already covers the user-facing feedback; the list state is TanStack Query's responsibility.
- **Session expired / auth gate** — not applicable (Cloudflare Access handles auth for `/admin/*`; live-view routes are public-in-LAN).

### Chosen variant

**v3 — diagnostic dense** (confirmed by user 2026-04-17).

Designer had recommended v1 (clinical minimal) for consistency with existing
screens, but the user prefers the diagnostic-dense tone. Implementation
implications:

- Monospace type (`font-mono`) on status-code badges (`OK` / `ERR` / `WARN` / `FATAL`).
- Inline log snippets in fatal errors and transcoder-warming states.
- Existing channel-list and live-player mocks use `font-sans` throughout; keep
  monospace *scoped* to status surfaces (badges, log lines, diagnostic cards),
  not bleeding into body copy.
- Shadcn primitive mapping stays the same (`Alert`, `Sonner`, `Skeleton`,
  `Progress`) — only the visual skin differs.
