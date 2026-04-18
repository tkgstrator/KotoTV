---
name: shadcn
description: Shadcn/ui workflow for the client package — initialize, add components, compose UIs. Uses the shadcn MCP server (already wired in .mcp.json). Load whenever building or refactoring frontend UI.
---

# Shadcn/ui in `packages/client`

Shadcn/ui is the **default UI kit**. Every visible surface is built from Shadcn primitives plus Tailwind utilities. Don't hand-roll a button or dialog when one exists.

## Tooling

- MCP server: `mcp__shadcn__*` (defined in root `.mcp.json`, no extra setup).
  - `search_items_in_registries` — find components by name/keyword
  - `list_items_in_registries` — enumerate what's installed
  - `view_items_in_registries` — read source before copying
  - `get_item_examples_from_registries` — pull usage examples
  - `get_add_command_for_items` — get the exact `bunx shadcn@latest add <name>` command
  - `get_audit_checklist` — verify wiring after adding
- CLI: `bunx shadcn@latest <init|add|…>` — always `bunx`, never `npx`.

## One-time init (Phase 0)

Run from `packages/client/`:

```sh
cd packages/client
bunx shadcn@latest init
```

Answer prompts:
- Style: **new-york**
- Base color: **slate** (avoid pure black/white — user preference)
- Tailwind: v4
- `components.json` lands at `packages/client/components.json`
- Aliases: `@/components`, `@/lib/utils`

## Adding a component

1. Ask the MCP: `mcp__shadcn__search_items_in_registries({ query: "dialog" })`
2. `mcp__shadcn__get_add_command_for_items({ items: ["dialog"] })` → copy-paste the command
3. Run it from `packages/client/`
4. Compose — don't fork the primitive. Wrap it in a feature component under `src/components/<feature>/`.

## Usage conventions

- Import from `@/components/ui/*` — never from `radix-ui` directly.
- Tailwind classes are merged with `cn()` from `@/lib/utils`. Never concatenate classnames with `+`.
- Variants: use `class-variance-authority` (`cva`). Match Shadcn's existing variant patterns for consistency.
- Dark mode: `next-themes` provider at the root; read `theme` via `useTheme()`. Default is `system`.
- **Do not use pure black (#000) or pure white (#fff)** for backgrounds, borders, or text. Use the Shadcn `background`/`foreground`/`muted`/`border` tokens from `tailwind.config`.

## Composition patterns for this project

| UI | Shadcn building blocks |
|----|------------------------|
| `ChannelCard` | `Card` + `Badge` (channel type) + `AspectRatio` for thumbnail |
| `ChannelList` | `ScrollArea` + `Separator` |
| `EPGGrid` | `ScrollArea` + custom cells (virtualized by `@tanstack/react-virtual`) |
| `HlsPlayer` controls | `Button`, `Slider`, `Tooltip`, `DropdownMenu` (quality selector) |
| `RecordingScheduleForm` | `Form` (RHF + zod resolver) + `Input`, `Select`, `DatePicker` |
| Notifications | `Sonner` (`toast`) — already in stack |

## Audit before committing

After adding or refactoring UI:

```ts
mcp__shadcn__get_audit_checklist()
```

Walk the checklist (accessibility, token usage, dark mode, focus states). Pair with the keyboard-focus requirement — the app targets remote-control UX eventually, so every interactive element must be reachable via Tab/Enter/arrow keys.

## Remote-friendly UI (forward compatibility)

- Every focusable element gets a visible `:focus-visible` ring.
- Group related interactive elements so `@noriginmedia/norigin-spatial-navigation` (future) can map them as a focus section.
- Avoid hover-only affordances — a remote has no hover.

## What NOT to do

- Don't install Radix primitives directly when Shadcn wraps them.
- Don't edit `components/ui/*` in place; wrap in a feature component.
- Don't skip `components.json` — the registry config is the source of truth.
- Don't mix class-string assembly with `cn()` usage; pick one pattern per file.