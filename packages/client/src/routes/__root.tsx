import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/AppShell'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout
})

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
