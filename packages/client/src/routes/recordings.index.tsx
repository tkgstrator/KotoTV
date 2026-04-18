import type { Recording, RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format, intervalToDuration } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarPlus, ListFilter, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { RecordingScheduleForm } from '@/components/recording/RecordingScheduleForm'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRecordingRules } from '@/hooks/useRecordingRules'
import { useDeleteRecording, useRecordingEvents, useRecordings } from '@/hooks/useRecordings'

type TabValue = 'pending' | 'completed' | 'failed'

interface RecordingsSearch {
  tab?: TabValue | undefined
}

function validateSearch(raw: Record<string, unknown>): RecordingsSearch {
  const TABS: TabValue[] = ['pending', 'completed', 'failed']
  const result: RecordingsSearch = {}
  if (typeof raw.tab === 'string' && (TABS as string[]).includes(raw.tab)) {
    result.tab = raw.tab as TabValue
  }
  return result
}

export const Route = createFileRoute('/recordings/')({
  validateSearch,
  component: RecordingsPage
})

function formatDuration(sec: number): string {
  const dur = intervalToDuration({ start: 0, end: sec * 1000 })
  const h = String(dur.hours ?? 0).padStart(2, '0')
  const m = String(dur.minutes ?? 0).padStart(2, '0')
  const s = String(dur.seconds ?? 0).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}

function DeleteScheduleButton({ scheduleId }: { scheduleId: string }) {
  const { mutate, isPending } = useDeleteRecording()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='h-7 gap-1 px-2 font-mono text-[0.6875rem] font-bold text-destructive hover:bg-destructive/10 hover:text-destructive'
          disabled={isPending}
          aria-label='予約キャンセル'
        >
          <Trash2 className='size-3' />
          CANCEL
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className='font-mono'>予約を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='font-mono text-[0.75rem]'>CANCEL</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive font-mono text-[0.75rem] text-destructive-foreground hover:bg-destructive/90'
            onClick={() => mutate(scheduleId)}
          >
            DELETE
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ScheduleRowEnhancedProps {
  schedule: RecordingSchedule & { ruleId?: string | null; failureReason?: string | null }
  ruleNameMap: Map<string, string>
}

function ScheduleRowEnhanced({ schedule, ruleNameMap }: ScheduleRowEnhancedProps) {
  const startLabel = format(new Date(schedule.startAt), 'yyyy-MM-dd HH:mm', { locale: ja })
  const endLabel = format(new Date(schedule.endAt), 'HH:mm', { locale: ja })
  const durationMs = new Date(schedule.endAt).getTime() - new Date(schedule.startAt).getTime()
  const durationMin = Math.round(durationMs / 60_000)
  const h = Math.floor(durationMin / 60)
  const m = durationMin % 60
  const durationLabel = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
  const ruleId = (schedule as { ruleId?: string | null }).ruleId
  const ruleName = ruleId ? ruleNameMap.get(ruleId) : null
  const isFailed = schedule.status === 'failed'

  return (
    <div className='flex items-stretch border-b border-border bg-card transition-colors hover:bg-muted/50'>
      <div className={`w-[3px] shrink-0 ${isFailed ? 'bg-destructive/50' : 'bg-amber-500'}`} />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5'>
        <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{schedule.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          {isFailed ? (
            <StatusChip variant='err' size='sm'>
              FAIL
            </StatusChip>
          ) : schedule.status === 'recording' ? (
            <StatusChip variant='rec' dot size='sm'>
              REC
            </StatusChip>
          ) : (
            <StatusChip variant='sched' size='sm'>
              SCHED
            </StatusChip>
          )}
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{schedule.channelId}</span>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>
            {startLabel}〜{endLabel}
          </span>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{durationLabel}</span>
          {ruleId && ruleName ? (
            <Link to='/recordings/rules/$id' params={{ id: ruleId }}>
              <StatusChip variant='info' size='sm' className='cursor-pointer hover:opacity-80'>
                RULE {ruleName}
              </StatusChip>
            </Link>
          ) : ruleId ? (
            <StatusChip variant='info' size='sm'>
              RULE
            </StatusChip>
          ) : (
            <StatusChip variant='muted' size='sm'>
              MANUAL
            </StatusChip>
          )}
          {isFailed && (schedule as { failureReason?: string | null }).failureReason && (
            <span className='font-mono text-[0.625rem] text-destructive'>
              {(schedule as { failureReason?: string | null }).failureReason}
            </span>
          )}
        </div>
      </div>
      {!isFailed && (
        <div className='flex shrink-0 items-center gap-1 px-2'>
          <DeleteScheduleButton scheduleId={schedule.id} />
        </div>
      )}
    </div>
  )
}

function RecordingRow({ rec }: { rec: Recording }) {
  const elapsed = rec.startedAt
    ? `${Math.round((Date.now() - new Date(rec.startedAt).getTime()) / 60_000)}min elapsed`
    : null
  const pct =
    rec.durationSec && rec.startedAt
      ? Math.min(100, ((Date.now() - new Date(rec.startedAt).getTime()) / (rec.durationSec * 1000)) * 100)
      : null

  return (
    <div className='flex items-stretch border-b border-border bg-card transition-colors hover:bg-muted/50'>
      <div className='w-[3px] shrink-0 bg-destructive' />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5'>
        <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{rec.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusChip variant='rec' dot size='sm'>
            REC
          </StatusChip>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{rec.channelId}</span>
          {elapsed && <span className='font-mono text-[0.6875rem] text-destructive'>{elapsed}</span>}
        </div>
        {pct !== null && (
          <div className='mt-1 h-[2px] overflow-hidden rounded-full bg-muted'>
            <div className='h-full bg-destructive transition-all' style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function DoneCard({ rec }: { rec: Recording }) {
  const dateLabel = rec.endedAt ? format(new Date(rec.endedAt), 'yyyy-MM-dd', { locale: ja }) : '—'
  const durationLabel = rec.durationSec ? formatDuration(rec.durationSec) : null
  const sizeLabel = rec.sizeBytes ? formatBytes(rec.sizeBytes) : null

  return (
    <Link
      to='/recordings/$id'
      params={{ id: rec.id }}
      className='flex flex-col bg-card transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring'
    >
      <div className='relative w-full pt-[56.25%]'>
        {rec.thumbnailUrl ? (
          <img src={rec.thumbnailUrl} alt={rec.title} className='absolute inset-0 h-full w-full object-cover' />
        ) : (
          <Skeleton className='absolute inset-0 h-full w-full rounded-none' />
        )}
        <span className='absolute left-1.5 top-1.5 rounded-sm bg-foreground/75 px-1 py-0.5 font-mono text-[0.5625rem] font-bold text-background backdrop-blur-sm'>
          {rec.channelId}
        </span>
        {durationLabel && (
          <span className='absolute bottom-1.5 right-1.5 rounded-sm bg-foreground/80 px-1 py-0.5 font-mono text-[0.5625rem] font-bold text-background'>
            {durationLabel}
          </span>
        )}
      </div>
      <div className='flex flex-col gap-1 px-2.5 py-2'>
        <span className='truncate font-mono text-[0.75rem] font-semibold text-foreground'>{rec.title}</span>
        <div className='flex items-center gap-1.5'>
          <StatusChip variant='done' size='sm'>
            DONE
          </StatusChip>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{dateLabel}</span>
          {sizeLabel && <span className='ml-auto font-mono text-[0.6875rem] text-muted-foreground'>{sizeLabel}</span>}
        </div>
      </div>
    </Link>
  )
}

function FailedRecordingRow({ rec }: { rec: Recording }) {
  const [open, setOpen] = useState(false)
  const dateLabel = rec.startedAt ? format(new Date(rec.startedAt), 'yyyy-MM-dd HH:mm', { locale: ja }) : '—'

  return (
    <div className='border-b border-border bg-card'>
      <button
        type='button'
        className='flex w-full items-stretch text-left transition-colors hover:bg-muted/50'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className='w-[3px] shrink-0 bg-destructive/50' />
        <div className='flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5'>
          <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{rec.title}</span>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusChip variant='err' size='sm'>
              FAIL
            </StatusChip>
            <span className='font-mono text-[0.6875rem] text-muted-foreground'>{rec.channelId}</span>
            <span className='font-mono text-[0.6875rem] text-muted-foreground'>{dateLabel}</span>
            <span className='font-mono text-[0.6875rem] text-destructive'>{open ? '▲ LOG' : '▼ LOG'}</span>
          </div>
        </div>
      </button>
      {open && (
        <div className='border-t border-border bg-muted/40 px-4 py-2 pl-[19px]'>
          <p className='font-mono text-[0.625rem] text-destructive'>ERR recording failed</p>
          <p className='font-mono text-[0.625rem] text-muted-foreground'>startedAt: {rec.startedAt}</p>
          {rec.filePath && <p className='font-mono text-[0.625rem] text-muted-foreground'>file: {rec.filePath}</p>}
        </div>
      )}
    </div>
  )
}

function RecordingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: '/recordings' })
  const activeTab: TabValue = tab ?? 'pending'

  const [formOpen, setFormOpen] = useState(false)
  const { data, isPending, isError } = useRecordings()
  const { data: rulesData } = useRecordingRules()

  useRecordingEvents()

  const ruleNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const rule of rulesData?.rules ?? []) m.set(rule.id, rule.name)
    return m
  }, [rulesData])

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

  const schedules = data?.schedules ?? []
  const recordings = data?.recordings ?? []

  const pendingItems = useMemo(
    () =>
      [
        ...recordings.filter((r) => r.status === 'recording'),
        ...schedules.filter((s) => s.status === 'pending' || s.status === 'recording')
      ].sort((a, b) => {
        const aTime = 'startAt' in a ? a.startAt : a.startedAt
        const bTime = 'startAt' in b ? b.startAt : b.startedAt
        return new Date(aTime).getTime() - new Date(bTime).getTime()
      }),
    [schedules, recordings]
  )

  const completedItems = useMemo(
    () =>
      recordings
        .filter((r) => r.status === 'completed')
        .sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime()),
    [recordings]
  )

  const failedItems = useMemo(
    () =>
      [...recordings.filter((r) => r.status === 'failed'), ...schedules.filter((s) => s.status === 'failed')].sort(
        (a, b) => {
          const aTime = 'startAt' in a ? a.startAt : a.startedAt
          const bTime = 'startAt' in b ? b.startAt : b.startedAt
          return new Date(bTime).getTime() - new Date(aTime).getTime()
        }
      ),
    [schedules, recordings]
  )

  return (
    <>
      <PageHeader ariaLabel='録画ヘッダー' className='items-center gap-2 px-3'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>録画</h1>
        {data && (
          <span className='font-mono text-[0.625rem] text-muted-foreground'>
            {recordings.filter((r) => r.status === 'recording').length} REC ·{' '}
            {schedules.filter((s) => s.status === 'pending').length} SCHED ·{' '}
            {recordings.filter((r) => r.status === 'completed').length} DONE
          </span>
        )}
        <div className='flex-1' />
        <Link to='/recordings/rules'>
          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1.5 px-3 font-mono text-[0.75rem] font-bold'
            aria-label='ルール管理'
          >
            <ListFilter className='size-3.5' />
            ルール管理
          </Button>
        </Link>
        <Button
          size='sm'
          className='h-7 gap-1.5 px-3 font-mono text-[0.75rem] font-bold'
          onClick={() => setFormOpen(true)}
          aria-label='新規予約 (⌘K)'
        >
          <CalendarPlus className='size-3.5' />
          RESERVE
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
            ERR 録画データの取得に失敗しました
          </div>
        </div>
      )}

      {!isPending && !isError && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => navigate({ search: { tab: v as TabValue } })}
          className='flex flex-1 flex-col overflow-hidden'
        >
          <div className='sticky top-0 z-10 border-b border-border bg-background px-3 pt-2'>
            <TabsList variant='line' className='gap-0'>
              <TabsTrigger value='pending' className='font-mono text-[0.75rem] font-bold'>
                録画待ち
                {pendingItems.length > 0 && (
                  <span className='ml-1 font-mono text-[0.5625rem] text-muted-foreground'>({pendingItems.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger value='completed' className='font-mono text-[0.75rem] font-bold'>
                完了
                {completedItems.length > 0 && (
                  <span className='ml-1 font-mono text-[0.5625rem] text-muted-foreground'>
                    ({completedItems.length})
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value='failed' className='font-mono text-[0.75rem] font-bold'>
                失敗
                {failedItems.length > 0 && (
                  <span className='ml-1 font-mono text-[0.5625rem] text-destructive'>({failedItems.length})</span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value='pending' className='flex-1 overflow-y-auto pb-16'>
            {pendingItems.length === 0 ? (
              <div className='px-4 py-12'>
                <p className='mb-3 font-mono text-[0.8125rem] font-semibold text-muted-foreground'>
                  $ nothing scheduled yet
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  className='font-mono text-[0.75rem]'
                  onClick={() => setFormOpen(true)}
                >
                  + 最初の予約を追加
                </Button>
              </div>
            ) : (
              <div>
                {pendingItems.map((item) =>
                  'startAt' in item ? (
                    <ScheduleRowEnhanced
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
          </TabsContent>

          <TabsContent value='completed' className='flex-1 overflow-y-auto pb-16'>
            {completedItems.length === 0 ? (
              <div className='px-4 py-12'>
                <div className='inline-block rounded-sm border border-border bg-muted/60 px-3.5 py-2.5 font-mono text-[0.75rem] text-muted-foreground'>
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
          </TabsContent>

          <TabsContent value='failed' className='flex-1 overflow-y-auto pb-16'>
            {failedItems.length === 0 ? (
              <div className='px-4 py-12'>
                <div className='inline-block rounded-sm border border-border bg-muted/60 px-3.5 py-2.5 font-mono text-[0.75rem] text-muted-foreground'>
                  $ no failures — good
                </div>
              </div>
            ) : (
              <div>
                {failedItems.map((item) =>
                  'startAt' in item ? (
                    <ScheduleRowEnhanced
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
          </TabsContent>
        </Tabs>
      )}

      <RecordingScheduleForm open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
