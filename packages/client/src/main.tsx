import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { routeTree } from './routeTree.gen'
import './index.css'

// Type-augment the meta shape so `{ skipGlobalError: true }` is checked.
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { skipGlobalError?: boolean }
    mutationMeta: { skipGlobalError?: boolean }
  }
}

// ─── Global error handlers ────────────────────────────────────────────────────
// Surface query/mutation failures as toast notifications so every page
// reports errors consistently. Individual hooks can opt out by setting
// `meta: { skipGlobalError: true }` (e.g. when they already toast a
// domain-specific message like `予約失敗: <reason>`).

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '不明なエラー'
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  },
  queryCache: new QueryCache({
    onError(err, query) {
      if (query.meta?.skipGlobalError) return
      // Background refetch failures with cached data are demoted to warnings;
      // the stale UI still renders so a blocking toast would be excessive.
      const hadCache = query.state.data !== undefined
      const msg = extractMessage(err)
      if (hadCache) {
        toast.warning(`再取得失敗: ${msg}`)
      } else {
        toast.error(`取得失敗: ${msg}`)
      }
    }
  }),
  mutationCache: new MutationCache({
    onError(err, _vars, _ctx, mutation) {
      if (mutation.meta?.skipGlobalError) return
      toast.error(`操作失敗: ${extractMessage(err)}`)
    }
  })
})

const router = createRouter({ routeTree, context: { queryClient } })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
        <RouterProvider router={router} />
        <Toaster richColors position='bottom-right' />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
