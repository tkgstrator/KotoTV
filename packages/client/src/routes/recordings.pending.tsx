import type { RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { RecordingRow, ScheduleRow } from '@/components/recording/recording-list-items'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingRules } from '@/hooks/useRecordingRules'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/pending')({
  component: PendingPage
})

function PendingPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()
  const { data: rulesData } = useRecordingRules()

  useRecordingEvents()

  const ruleNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const rule of rulesData?.rules ?? []) m.set(rule.id, rule.name)
    return m
  }, [rulesData])

  const pendingItems = useMemo(() => {
    const schedules = data?.schedules ?? []
    const recordings = data?.recordings ?? []
    return [
      ...recordings.filter((r) => r.status === 'recording'),
      ...schedules.filter((s) => s.status === 'pending' || s.status === 'recording')
    ].sort((a, b) => {
      const aTime = 'startAt' in a ? a.startAt : a.startedAt
      const bTime = 'startAt' in b ? b.startAt : b.startedAt
      return new Date(aTime).getTime() - new Date(bTime).getTime()
    })
  }, [data])

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
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
          ERR 録画データの取得に失敗しました
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='flex-1 overflow-y-auto pb-16'>
        {pendingItems.length === 0 ? (
          <div className='px-4 py-12'>
            <p className='mb-3 text-subheadline font-semibold text-muted-foreground'>$ nothing scheduled yet</p>
            <Button variant='outline' size='sm' className='text-footnote' onClick={() => setFormOpen(true)}>
              + 最初の予約を追加
            </Button>
          </div>
        ) : (
          <div>
            {pendingItems.map((item) =>
              'startAt' in item ? (
                <ScheduleRow
                  key={item.id}
                  schedule={item as RecordingSchedule & { ruleId?: string | null }}
                  ruleNameMap={ruleNameMap}
                />
              ) : (
                <RecordingRow key={item.id} rec={item} />
              )
            )}
          </div>
        )}
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
