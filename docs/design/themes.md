# Design Themes

## What is a theme in this codebase?

A theme is a named set of CSS custom properties declared in `packages/client/src/index.css` under `:root[data-theme="<name>"]` that override the base design tokens. Tailwind v4 `@theme inline` then maps those vars to utility classes. Components consume the utilities — they never hardcode raw values.

### Themes are complete visual units — no piecemeal overrides

A theme is NOT a knob for tweaking one color. **Every new theme MUST redeclare the full set of tokens as a cohesive system** — background, foreground, surface hierarchy, border, primary / secondary / accent, destructive / warning / success, status surface radius, action radius, font stacks, chip typography. Partial themes break visual consistency.

Concretely, a theme declaration at minimum overrides:

- **Palette**: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--destructive`, `--destructive-foreground`, `--success`, `--border`, `--input`, `--ring`
- **Shape**: `--radius` (base), `--radius-status`, `--radius-action`
- **Typography**: `--font-mono`, `--font-sans`, `--text-status`, `--tracking-status`
- **Both modes**: light + dark (use `:root[data-theme="<name>"]` + `:root[data-theme="<name>"].dark`)

A theme is accepted only when it passes the regression suite against all locked mocks: every screen (`channel-list`, `epg`, `live-player`, `recording-player`, `recordings`, `settings`, `app-shell`, `states`) must still render legibly under the new theme. If a theme needs a component to change *structure* (not just appearance), that is a new design direction, not a theme swap — open a `docs/mocks/<screen>/` exploration instead.

The active theme is declared once in `packages/client/index.html`:

```html
<html lang="ja" data-theme="tech">
```

## The Tech Theme

The canonical visual language for this app. Diagnostic-dense, status-forward, monospace on status surfaces, neutral-dominant palette.

### Fonts

| Role | Variable | Value |
|------|----------|-------|
| Monospace (status surfaces, log lines, chips) | `--font-mono` | `'JetBrains Mono', 'Fira Code', Menlo, Consolas, ui-monospace, monospace` |
| Sans (titles, body, navigation) | `--font-sans` | `system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif` |

Use `font-mono` on anything that carries live operational data (chips, health bar, log tail, player diagnostic overlay). Use `font-sans` everywhere else.

### Surface Radius Scale

| Token | Value | Tailwind class | When to use |
|-------|-------|---------------|-------------|
| `--radius-status` | `3px` | `rounded-status` | StatusChip, log-line badges, any dense operational label |
| `--radius-action` | `calc(var(--radius) - 2px)` = `0.25rem` | `rounded-action` | Buttons, interactive controls — matches `rounded-md` |
| `--radius` | `0.5rem` | `rounded-lg` | Cards, dialogs, panels |
| `--radius-xl` | `calc(var(--radius) + 4px)` | `rounded-xl` | Large surfaces, sheet headers |

### Color Roles

| Role | Token var | Tailwind class | When to use |
|------|-----------|---------------|-------------|
| ok / nominal | `--success` | `text-success`, `bg-success` | Service running, recording done, tuner OK |
| warn / degraded | amber-500 (Tailwind built-in) | `text-amber-500`, `bg-amber-500` | Buffer pressure, partial failure, advisory |
| err / error | `--destructive` | `text-destructive`, `bg-destructive` | Recoverable error, stream error |
| fatal | `--destructive` filled | `bg-destructive text-destructive-foreground` | Unrecoverable crash, tuner dead |
| live / rec | `--destructive` (tinted) | `bg-destructive/12 text-destructive` | Active live/recording indicator |
| sched / inactive | `--muted` | `bg-muted text-muted-foreground` | Scheduled but not yet active |
| done | `--primary` (tinted) | `bg-primary/12 text-primary` | Completed recordings |
| info | `--primary` (tinted) | `bg-primary/12 text-primary` | General informational state |
| buf | amber-500 (tinted) | `bg-amber-500/10 text-amber-500` | Buffer stall, rebuffering |
| muted | `--muted` | `bg-muted text-muted-foreground` | De-emphasised / not actionable |

Never invent new color roles. If a new state maps to an existing semantic, reuse it.

### Typography Scale for Status/Operational Surfaces

| Surface | Size | Weight | Case | Tracking | Font |
|---------|------|--------|------|----------|------|
| Status chip | `0.6875rem` (`text-status`) | bold | uppercase | `0.05em` (`tracking-status`) | mono |
| Log line / diagnostic | `0.75rem` | normal | as-is | default | mono |
| Body / label | `0.875rem` | normal | as-is | default | sans |
| Section title | `1rem` | semibold | as-is | default | sans |
| Page title | `1.125rem` | bold | as-is | tight | sans |

### Always-Opaque Surface Rule

**Never use `bg-background` or any surface token without an opaque value underneath.**

Phase 1 shipped with `--background` resolving to `transparent` in certain Tailwind v4 `@theme inline` configurations, causing channel list rows to bleed through sticky headers. The fix (commit `82bd11c`) ensured every `--color-*` alias resolves to a concrete `oklch()` value at all times.

Rule: `@theme inline` aliases must map `--color-<name>` → `var(--<name>)` where `--<name>` is always set to a concrete value in `:root`. Never leave a `--color-*` variable unresolved.

### "Status-Forward, Not Brand-Forward" Principle

Accent color (`--primary`) is reserved for primary interactive actions (buttons, links, focus rings). Status surfaces use semantic colors from the grammar above. If something looks "branded" by accident — e.g. a success chip that matches the primary blue — it is a coincidence, not intent. The status color grammar overrides brand alignment.

### Components That MUST Use Theme Tokens

These components are the test surface for any theme swap:

| Component | Tokens consumed |
|-----------|----------------|
| `<StatusChip>` | `rounded-status`, `text-status`, `tracking-status`, `font-mono` |
| Player diagnostic sidebar | `font-mono`, `text-status` |
| EPG NOW-strip | `rounded-status`, status color grammar |
| App-shell health bar (32px strip) | `font-mono`, `text-status`, `rounded-status` |
| Settings health panel | same as health bar |
| Recording feed status badges | `<StatusChip>` via variant |

## How to Add a New Theme

1. Open `packages/client/src/index.css`. Add a scoped block that overrides only the tokens you want different:

   ```css
   :root[data-theme="friendly"] {
     --font-mono: ui-monospace, monospace;
     --radius-status: 6px;
     --radius-action: 0.375rem;
   }
   ```

   You do not need to redeclare tokens you are keeping from the Tech theme.

2. In `packages/client/index.html`, flip the attribute:

   ```html
   <html lang="ja" data-theme="friendly">
   ```

   In a future settings UI this would be a runtime write to `document.documentElement.dataset.theme`.

3. Components that use `rounded-status`, `font-mono`, `text-status`, `tracking-status` automatically reflect the new values. No component code changes.

4. Verify the six locked screens render correctly under the new theme. A new theme is valid when all six screens in `docs/mocks/` still parse visually without structural breakage.

5. If the new theme requires *structural* differences (different layout, different component composition) rather than just token swaps, it is a new *design direction*, not a theme. Open a designer task.

## Reference

- Locked mocks: `docs/mocks/channel-list/`, `docs/mocks/states/`, `docs/mocks/epg/`, `docs/mocks/live-player/`, `docs/mocks/recordings/`, `docs/mocks/settings/`, `docs/mocks/app-shell/`
- Token source: `packages/client/src/index.css` — `@theme inline` block
- Primary test surface: `packages/client/src/components/ui/status-chip.tsx`
- Regression smoke: `tests/ux/theme.spec.ts`
