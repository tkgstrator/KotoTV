import type { Recording, RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { Link } from '@tanstack/react-router'
import { format, formatDistanceStrict, intervalToDuration } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { StatusChip } from '@/components/shared/status-chip'
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
import { useDeleteRecording } from '@/hooks/useRecordings'

interface RecordingListProps {
  schedules: RecordingSchedule[]
  recordings: Recording[]
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className='flex items-center gap-2 px-4 pb-2 pt-5'>
      <span className='font-mono text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground'>
        {label}
      </span>
      <span className='font-mono text-[0.625rem] font-bold text-muted-foreground'>({count})</span>
      <div className='h-px flex-1 bg-border' />
    </div>
  )
}

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

function RecordingRow({ rec }: { rec: Recording }) {
  const elapsed = rec.startedAt ? formatDistanceStrict(new Date(rec.startedAt), new Date(), { locale: ja }) : null

  const pct =
    rec.durationSec && rec.startedAt
      ? Math.min(100, ((Date.now() - new Date(rec.startedAt).getTime()) / (rec.durationSec * 1000)) * 100)
      : null

  return (
    <div className='flex items-stretch border-b border-border bg-card transition-colors hover:bg-muted/50'>
      <div className='w-[3px] shrink-0 bg-destructive' />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5'>
        <div className='flex items-center gap-2'>
          <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{rec.title}</span>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusChip variant='rec' dot size='sm'>
            REC
          </StatusChip>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{rec.channelId}</span>
          {elapsed && <span className='font-mono text-[0.6875rem] text-destructive'>ELAPSED {elapsed}</span>}
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

function ScheduleRow({ schedule }: { schedule: RecordingSchedule }) {
  const startLabel = format(new Date(schedule.startAt), 'yyyy-MM-dd HH:mm', { locale: ja })
  const endLabel = format(new Date(schedule.endAt), 'HH:mm', { locale: ja })
  const durationMs = new Date(schedule.endAt).getTime() - new Date(schedule.startAt).getTime()
  const durationMin = Math.round(durationMs / 60_000)
  const h = Math.floor(durationMin / 60)
  const m = durationMin % 60
  const durationLabel = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`

  return (
    <div className='flex items-stretch border-b border-border bg-card transition-colors hover:bg-muted/50'>
      <div className='w-[3px] shrink-0 bg-amber-500' />
      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5'>
        <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{schedule.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusChip variant='sched' size='sm'>
            SCHED
          </StatusChip>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{schedule.channelId}</span>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>
            {startLabel}〜{endLabel}
          </span>
          <span className='font-mono text-[0.6875rem] text-muted-foreground'>{durationLabel}</span>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-1 px-2'>
        <DeleteScheduleButton scheduleId={schedule.id} />
      </div>
    </div>
  )
}

function FailRow({ rec }: { rec: Recording }) {
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

export function RecordingList({ schedules, recordings }: RecordingListProps) {
  const recNow = recordings.filter((r) => r.status === 'recording')
  const scheduled = schedules.filter((s) => s.status === 'pending')
  const failed = recordings.filter((r) => r.status === 'failed')
  const done = recordings.filter((r) => r.status === 'completed')

  return (
    <div className='pb-16'>
      {/* REC NOW */}
      {recNow.length > 0 && (
        <section>
          <SectionHeader label='REC NOW' count={recNow.length} />
          {recNow.map((r) => (
            <RecordingRow key={r.id} rec={r} />
          ))}
        </section>
      )}

      {/* SCHED */}
      {scheduled.length > 0 && (
        <section>
          <SectionHeader label='SCHED' count={scheduled.length} />
          {scheduled.map((s) => (
            <ScheduleRow key={s.id} schedule={s} />
          ))}
        </section>
      )}

      {/* FAIL */}
      {failed.length > 0 && (
        <section>
          <SectionHeader label='FAIL' count={failed.length} />
          {failed.map((r) => (
            <FailRow key={r.id} rec={r} />
          ))}
        </section>
      )}

      {/* DONE */}
      <section>
        <SectionHeader label='DONE' count={done.length} />
        {done.length === 0 ? (
          <div className='px-4 py-12'>
            <div className='inline-block rounded-sm border border-border bg-muted/60 px-3.5 py-2.5 font-mono text-[0.75rem] text-muted-foreground'>
              $ ls recordings/ → 0 items
            </div>
          </div>
        ) : (
          <div className='grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-px bg-border'>
            {done.map((r) => (
              <DoneCard key={r.id} rec={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
