import { createFileRoute } from '@tanstack/react-router'
import { parseISO } from 'date-fns'
import { TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DoneCard } from '@/components/recording/recording-list-items'
import { RecordingPageHeader } from '@/components/recording/recording-page-header'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/completed')({
  component: CompletedPage
})

function CompletedPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()
  const { data: channelsData } = useChannels()

  useRecordingEvents()

  const channelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ch of channelsData?.channels ?? []) {
      m.set(ch.id, ch.name)
    }
    return m
  }, [channelsData])

  const items = useMemo(() => {
    return (data?.recordings ?? [])
      .filter((r) => r.status === 'completed')
      .sort((a, b) => (b.endedAt ? parseISO(b.endedAt).getTime() : 0) - (a.endedAt ? parseISO(a.endedAt).getTime() : 0))
  }, [data])

  if (isPending) {
    return (
      <div className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-8 p-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
          <div key={i} className='flex flex-col gap-2'>
            <Skeleton className='aspect-video w-full rounded-xl' />
            <Skeleton className='h-4 w-5/6' />
            <Skeleton className='h-3 w-2/3' />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className='p-4'>
        <Alert variant='destructive'>
          <TriangleAlert />
          <AlertTitle>データの取得に失敗しました</AlertTitle>
          <AlertDescription>録画データを読み込めませんでした。再度お試しください。</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <RecordingPageHeader ariaLabel='録画済みヘッダー' stats={[]} />
        <div className='px-4 py-12'>
          <p className='text-footnote text-muted-foreground'>録画済みの番組はまだありません</p>
        </div>
        <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
      </>
    )
  }

  const totalSizeGB = items.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0) / (1024 * 1024 * 1024)

  return (
    <>
      <RecordingPageHeader
        ariaLabel='録画済みヘッダー'
        stats={[
          { label: '件数', value: items.length },
          { label: '合計', value: `${totalSizeGB.toFixed(1)} GB` }
        ]}
      />
      <div className='flex-1 overflow-y-auto pb-16'>
        <div className='grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-8 px-4 py-4'>
          {items.map((r) => (
            <DoneCard key={r.id} rec={r} channelName={channelMap.get(r.channelId) ?? r.channelId} />
          ))}
        </div>
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
