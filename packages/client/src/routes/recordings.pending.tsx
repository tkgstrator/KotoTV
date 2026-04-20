import type { RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { RecordingRow, ScheduleRow } from '@/components/recording/recording-list-items'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { PageHeader } from '@/components/shell/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingRules } from '@/hooks/useRecordingRules'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/pending')({
  component: PendingPage
})

type PendingFilter = 'recording' | 'scheduled'

function PendingPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<PendingFilter>('recording')
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

  const activeCount = pendingItems.filter((i) => !('startAt' in i)).length
  const scheduledCount = pendingItems.length - activeCount
  const visibleItems = pendingItems.filter((i) => {
    const isScheduled = 'startAt' in i
    return filter === 'recording' ? !isScheduled : isScheduled
  })

  const tabs = [
    { value: 'recording' as const, label: `録画中 ${activeCount}` },
    { value: 'scheduled' as const, label: `予約 ${scheduledCount}` }
  ]

  const header = (
    <PageHeader ariaLabel='録画中ヘッダー'>
      <div className='flex h-full w-[320px] max-w-full self-stretch'>
        <SegmentedFilter ariaLabel='録画状態' tabs={tabs} value={filter} onChange={setFilter} />
      </div>
    </PageHeader>
  )

  if (isPending) {
    return (
      <>
        {header}
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-12 w-full rounded' />
          ))}
        </div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {header}
        <div className='px-4 py-12'>
          <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
            録画データの取得に失敗しました
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className='flex-1 overflow-y-auto pb-16'>
        {visibleItems.length === 0 ? (
          <div className='px-4 py-12'>
            <p className='text-subheadline font-semibold text-muted-foreground'>
              {filter === 'recording'
                ? '録画中のジョブはありません'
                : '予約はまだありません — 番組表かルールから追加できます'}
            </p>
          </div>
        ) : (
          <div>
            {visibleItems.map((item) =>
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
