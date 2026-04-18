---
name: spatial-nav
description: Forward-compatibility guide for remote-control / D-pad UX (future tvOS / FireTV port). Keep web-app DOM structure and focus rings such that `@noriginmedia/norigin-spatial-navigation` can layer on later. Load before building major UI surfaces or refactoring focus behavior.
---

# Spatial navigation (forward compat)

Initial target is Web UI only. Long term: tvOS / FireTV / Android TV via React Native, where input is a remote with up/down/left/right and OK. Decisions we make now either enable or block that port.

## Retrieval source

- `@noriginmedia/norigin-spatial-navigation`: https://github.com/NoriginMedia/Norigin-Spatial-Navigation

## Rules we enforce now (Web UI)

Even without installing the library, follow these rules so the port is mostly mechanical:

1. **Every interactive element is `tabIndex`-reachable.** Custom Shadcn components already handle this; don't disable it.
2. **Every interactive element has a visible `:focus-visible` ring.** Use the Shadcn `focus-visible:ring-2 focus-visible:ring-ring` utilities — don't remove them.
3. **DOM order = visual order = navigation order.** Avoid absolute positioning that reorders items unless you also fix tab order.
4. **Group related widgets in a wrapping element with a stable role.** Channel cards live in a `<ul>` / grid container, program cells in an EPG grid, player controls in a toolbar. The spatial nav library will map each group to a "focus section".
5. **No hover-only affordances.** Tooltips that only appear on `:hover` disappear on a TV — use `:hover, :focus-visible` (Shadcn `Tooltip` already does).
6. **Scroll into view on focus.** When focus moves inside a long list, call `el.scrollIntoView({ block: 'nearest', inline: 'nearest' })`.
7. **Keep clickable surface large.** TV remote is less precise than mouse; pad interactive elements (Shadcn defaults are OK).
8. **No modals that trap focus permanently.** `Dialog` must Escape out; keep an explicit close action.

## Component-specific checks

- `ChannelCard`: root element is focusable; `Enter` triggers navigate to `/live/:channelId`. Whole card is the hit target, not a nested button.
- `EPGGrid`: each `ProgramCell` is focusable in DOM row-major order; virtualization (react-virtual) must not reorder focus sequence when scrolling.
- `HlsPlayer`: `<video tabIndex={0}>` receives focus. Left/Right arrow = seek (Phase 5), Space = toggle play, Up/Down = volume.
- `Dialog` / `DropdownMenu`: Shadcn defaults handle focus trap + restore. Don't override.

## When the port happens

```sh
bun add @noriginmedia/norigin-spatial-navigation
```

Wrap the root with `<FocusContext.Provider value={...}>`, register focus sections per group. Move arrow-key handlers from ad-hoc `onKeyDown` to `useFocusable` hooks. The DOM structure should already support this — no major refactor needed if we follow the rules above.

## What NOT to do

- Building a global "KeyboardShortcuts" layer right now. It's a premature abstraction and will fight the spatial-nav library later.
- Using arrow-key handlers in custom components for navigation today. Tab/Shift-Tab is sufficient for Web; spatial-nav will replace it cleanly.
- Hiding focus rings "for aesthetic reasons". Doing so now forces a re-polish later.