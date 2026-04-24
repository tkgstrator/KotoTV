---
name: tanstack-query-best-practices
description: TanStack Query conventions for `packages/client`. Query key shape, stale times, mutation invalidation, and colocated hook patterns used in this repo.
---

# TanStack Query best practices

This client uses **@tanstack/react-query** for server state. The `QueryClient` is created once in `packages/client/src/main.tsx` and injected into TanStack Router context.

## Current app defaults

`packages/client/src/main.tsx`:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
})
```

Implications:

- Prefer the global `staleTime: 30_000` unless a screen clearly needs fresher or slower data.
- Do not raise retries casually. The app currently fails fast to keep UI feedback predictable.
- Keep one `QueryClient` per app, not per route or component.

## Hook placement

Colocate query and mutation hooks under `packages/client/src/hooks/`.

Examples already in the repo:

- `useChannels.ts`
- `usePrograms.ts`
- `useRecordings.ts`
- `useRecordingRules.ts`
- `useEncodeProfiles.ts`

Pattern:

```ts
export const ENCODE_PROFILES_KEY = ['encode-profiles'] as const

export function useEncodeProfiles() {
  return useQuery({
    queryKey: ENCODE_PROFILES_KEY,
    queryFn: fetchProfiles,
    staleTime: 60_000
  })
}
```

Keep the fetcher and the hook in the same file unless the fetcher is reused elsewhere.

## Query keys

Use stable array keys and export the base key constant.

Good patterns from this repo:

```ts
export const RECORDINGS_KEY = ['recordings'] as const
export const RULES_KEY = ['rules'] as const
export const ENCODE_PROFILES_KEY = ['encode-profiles'] as const
export const BENCHMARK_HISTORY_KEY = ['encode-profiles', 'benchmark', 'history'] as const
```

Rules:

- Start with a feature-level namespace.
- Add params in array order instead of string concatenation.
- Reuse exported constants for invalidation.
- Use `as const` so TypeScript preserves the literal tuple shape.

## Mutations and invalidation

Mutations in this repo invalidate the affected list keys on success.

Example:

```ts
export function useDeleteEncodeProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENCODE_PROFILES_KEY })
      qc.invalidateQueries({ queryKey: ['rules'] })
    }
  })
}
```

Guidelines:

- Invalidate the narrowest stable key that refreshes the affected screen.
- If a mutation changes related resources, invalidate both feature areas explicitly.
- Prefer invalidation over manual cache surgery unless the optimistic update is straightforward and clearly worth the complexity.

## Error handling

Fetcher functions in this repo throw `Error` when `res.ok` is false.

Pattern:

```ts
const res = await fetch('/api/encode-profiles')
if (!res.ok) throw new Error(`HTTP ${res.status}`)
return res.json()
```

For mutation endpoints that return structured API errors, decode the body and surface the server message when available.

## Route integration

TanStack Router already carries `queryClient` in router context. For page-blocking data, prefer loader-prefetch plus query reuse. For secondary data, `useQuery` in the component is sufficient.

- Loader path: use when the route should render with data ready.
- Component path: use when a local pending state is acceptable.

## Stale time guidance

This repo already varies stale times per domain:

- default: `30_000`
- encode profiles: `60_000`
- benchmark history: `10_000`

Choose stale times based on how fast the server state changes, not by habit.

- Static-ish reference data: longer stale time.
- Activity feeds / recent history: shorter stale time.
- User-triggered refresh loops: short stale time plus targeted invalidation.

## Pitfalls

- Do not create ad-hoc string query keys.
- Do not hide invalidation logic in UI components; keep it in the mutation hook.
- Do not create a new `QueryClient` inside tests, routes, or components unless the test explicitly needs isolation.
- Do not overuse `refetchOnWindowFocus` toggles unless a specific screen needs them.
