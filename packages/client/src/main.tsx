import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only surface background refetch failures — initial load errors are
      // shown inline by each component so the user gets context.
      if (query.state.data !== undefined) {
        toast.error(error instanceof Error ? error.message : 'データの更新に失敗しました')
      }
    }
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    },
    mutations: {
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'エラーが発生しました'
        toast.error(message)
      }
    }
  }
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
