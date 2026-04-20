import type { RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { FailedRecordingRow, ScheduleRow } from '@/components/recording/recording-list-items'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingRules } from '@/hooks/useRecordingRules'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings/failed')({
  component: FailedPage
})

function FailedPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()
  const { data: rulesData } = useRecordingRules()

  useRecordingEvents()

  const ruleNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const rule of rulesData?.rules ?? []) m.set(rule.id, rule.name)
    return m
  }, [rulesData])

  const failedItems = useMemo(() => {
    const schedules = data?.schedules ?? []
    const recordings = data?.recordings ?? []
    return [...recordings.filter((r) => r.status === 'failed'), ...schedules.filter((s) => s.status === 'failed')].sort(
      (a, b) => {
        const aTime = 'startAt' in a ? a.startAt : a.startedAt
        const bTime = 'startAt' in b ? b.startAt : b.startedAt
        return new Date(bTime).getTime() - new Date(aTime).getTime()
      }
    )
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
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 font-mono text-footnote text-destructive'>
          ERR 録画データの取得に失敗しました
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='flex-1 overflow-y-auto pb-16'>
        {failedItems.length === 0 ? (
          <div className='px-4 py-12'>
            <div className='inline-block rounded-sm border border-border bg-muted/60 px-3.5 py-2.5 font-mono text-footnote text-muted-foreground'>
              $ no failures — good
            </div>
          </div>
        ) : (
          <div>
            {failedItems.map((item) =>
              'startAt' in item ? (
                <ScheduleRow
                  key={item.id}
                  schedule={item as RecordingSchedule & { ruleId?: string | null; failureReason?: string | null }}
                  ruleNameMap={ruleNameMap}
                />
              ) : (
                <FailedRecordingRow key={item.id} rec={item} />
              )
            )}
          </div>
        )}
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
