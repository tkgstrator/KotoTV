import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { DoneCard } from '@/components/recording/recording-list-items'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/completed')({
  component: CompletedPage
})

function CompletedPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()

  useRecordingEvents()

  const completedItems = useMemo(
    () =>
      (data?.recordings ?? [])
        .filter((r) => r.status === 'completed')
        .sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime()),
    [data]
  )

  if (isPending) {
    return (
      <div className='flex flex-col gap-2 p-4'>
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
          <Skeleton key={i} className='h-12 w-full rounded' />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className='px-4 py-12'>
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 font-mono text-footnote text-destructive'>
          ERR 録画データの取得に失敗しました
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='flex-1 overflow-y-auto pb-16'>
        {completedItems.length === 0 ? (
          <div className='px-4 py-12'>
            <div className='inline-block rounded-sm border border-border bg-muted/60 px-3.5 py-2.5 font-mono text-footnote text-muted-foreground'>
              $ ls recordings/ → 0 items
            </div>
          </div>
        ) : (
          <div className='grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-px bg-border'>
            {completedItems.map((r) => (
              <DoneCard key={r.id} rec={r} />
            ))}
          </div>
        )}
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
