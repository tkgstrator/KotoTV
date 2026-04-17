import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: IndexPage
})

function IndexPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await api.api.status.$get()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
  })

  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Telemax</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending && <p className='text-sm text-[var(--muted-foreground)]'>Connecting…</p>}
          {isError && <p className='text-sm text-[var(--destructive)]'>Failed to reach server.</p>}
          {data && (
            <pre className='rounded-md bg-[var(--muted)] p-3 text-xs leading-relaxed text-[var(--foreground)]'>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
