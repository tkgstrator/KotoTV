import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * Layout route for /recordings/rules and its children (/rules, /rules/new, /rules/:id).
 * The list page lives in `recordings.rules.index.tsx`; editors live in
 * `recordings.rules.new.tsx` and `recordings.rules.$id.tsx`.
 */
export const Route = createFileRoute('/recordings/rules')({
  component: RulesLayout
})

function RulesLayout() {
  return <Outlet />
}
