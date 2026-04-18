import { createFileRoute } from '@tanstack/react-router'
import { CalendarPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RecordingList } from '@/components/recording/RecordingList'
import { RecordingScheduleForm } from '@/components/recording/RecordingScheduleForm'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

export const Route = createFileRoute('/recordings')({
  component: RecordingsPage
})

function RecordingsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()

  useRecordingEvents()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setFormOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const isEmpty = !isPending && !isError && (data?.schedules.length ?? 0) === 0 && (data?.recordings.length ?? 0) === 0

  return (
    <>
      <PageHeader ariaLabel='録画ヘッダー' className='items-center gap-2 px-3'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>録画</h1>
        {data && (
          <span className='font-mono text-[0.625rem] text-muted-foreground'>
            {data.recordings.filter((r) => r.status === 'recording').length} REC ·{' '}
            {data.schedules.filter((s) => s.status === 'pending').length} SCHED ·{' '}
            {data.recordings.filter((r) => r.status === 'completed').length} DONE ·{' '}
            {data.recordings.filter((r) => r.status === 'failed').length} FAIL
          </span>
        )}
        <div className='flex-1' />
        <Button
          size='sm'
          className='h-7 gap-1.5 px-3 font-mono text-[0.75rem] font-bold'
          onClick={() => setFormOpen(true)}
          aria-label='新規予約 (⌘K)'
        >
          <CalendarPlus className='size-3.5' />+ RESERVE
        </Button>
      </PageHeader>

      {isPending && (
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-12 w-full rounded' />
          ))}
        </div>
      )}

      {isError && (
        <div className='px-4 py-12'>
          <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 font-mono text-[0.75rem] text-destructive'>
            ERR 録画データの取得に失敗しました (DB 読み取り失敗、サーバー再起動で解決する可能性)
          </div>
        </div>
      )}

      {isEmpty && (
        <div className='px-4 py-12'>
          <p className='mb-3 font-mono text-[0.8125rem] font-semibold text-muted-foreground'>$ nothing scheduled yet</p>
          <Button variant='outline' size='sm' className='font-mono text-[0.75rem]' onClick={() => setFormOpen(true)}>
            + 最初の予約を追加
          </Button>
        </div>
      )}

      {!isPending && !isError && !isEmpty && data && (
        <RecordingList schedules={data.schedules} recordings={data.recordings} />
      )}

      <RecordingScheduleForm open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
