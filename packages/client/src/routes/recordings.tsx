import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * Layout route for /recordings and all nested routes (/recordings, /recordings/rules,
 * /recordings/rules/:id, etc.). The actual `/recordings` page lives in
 * `recordings.index.tsx`; rule surfaces live in `recordings.rules.*.tsx`.
 * All children slot in via this Outlet.
 */
export const Route = createFileRoute('/recordings')({
  component: RecordingsLayout
})

function RecordingsLayout() {
  return <Outlet />
}
