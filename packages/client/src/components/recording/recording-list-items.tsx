import type { Recording, RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { Link } from '@tanstack/react-router'
import { format, intervalToDuration } from 'date-fns'
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
import { useDeleteRecording } from '@/hooks/useRecordings'

export function formatDuration(sec: number): string {
  const dur = intervalToDuration({ start: 0, end: sec * 1000 })
  const h = String(dur.hours ?? 0).padStart(2, '0')
  const m = String(dur.minutes ?? 0).padStart(2, '0')
  const s = String(dur.seconds ?? 0).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function formatBytes(bytes: number): string {
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
          className='h-7 gap-1 px-2 font-mono text-caption font-bold text-destructive hover:bg-destructive/10 hover:text-destructive'
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
          <AlertDialogCancel className='font-mono text-footnote'>CANCEL</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive font-mono text-footnote text-destructive-foreground hover:bg-destructive/90'
            onClick={() => mutate(scheduleId)}
          >
            DELETE
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ScheduleRowProps {
  schedule: RecordingSchedule & { ruleId?: string | null; failureReason?: string | null }
  ruleNameMap: Map<string, string>
}

export function ScheduleRow({ schedule, ruleNameMap }: ScheduleRowProps) {
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
        <span className='truncate font-mono text-subheadline font-semibold text-foreground'>{schedule.title}</span>
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
          <span className='font-mono text-caption text-muted-foreground'>{schedule.channelId}</span>
          <span className='font-mono text-caption text-muted-foreground'>
            {startLabel}〜{endLabel}
          </span>
          <span className='font-mono text-caption text-muted-foreground'>{durationLabel}</span>
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
            <span className='font-mono text-caption2 text-destructive'>
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

export function RecordingRow({ rec }: { rec: Recording }) {
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
        <span className='truncate font-mono text-subheadline font-semibold text-foreground'>{rec.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusChip variant='rec' dot size='sm'>
            REC
          </StatusChip>
          <span className='font-mono text-caption text-muted-foreground'>{rec.channelId}</span>
          {elapsed && <span className='font-mono text-caption text-destructive'>{elapsed}</span>}
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

interface DoneCardProps {
  rec: Recording
  /** Friendly channel name to show under the title (e.g. "NHK総合"). */
  channelName?: string | undefined
}

export function DoneCard({ rec, channelName }: DoneCardProps) {
  const dateLabel = rec.endedAt ? format(new Date(rec.endedAt), 'yyyy/M/d', { locale: ja }) : '—'
  const durationLabel = rec.durationSec ? formatDuration(rec.durationSec) : null
  const sizeLabel = rec.sizeBytes ? formatBytes(rec.sizeBytes) : null

  return (
    <Link to='/recordings/$id' params={{ id: rec.id }} className='group flex flex-col gap-2 focus-visible:outline-none'>
      {/* 16:9 thumbnail with YouTube-style rounding. Flat muted fill
          when no image is available. */}
      <div className='relative aspect-video w-full overflow-hidden rounded-xl bg-muted transition-[border-radius] group-hover:rounded-lg group-focus-visible:rounded-lg group-focus-visible:ring-2 group-focus-visible:ring-ring'>
        {rec.thumbnailUrl && (
          <img src={rec.thumbnailUrl} alt='' className='absolute inset-0 h-full w-full object-cover' />
        )}
        {durationLabel && (
          <span className='absolute right-2 bottom-2 rounded-md bg-foreground/85 px-1.5 py-0.5 text-caption font-semibold tabular-nums text-background'>
            {durationLabel}
          </span>
        )}
      </div>

      {/* Meta rows — title, channel, date + size. Matches YouTube's
          two-line title + muted metadata below. */}
      <div className='flex flex-col gap-0.5 px-0.5'>
        <h3 className='line-clamp-2 text-subheadline font-semibold leading-[1.3] text-foreground group-hover:text-foreground'>
          {rec.title}
        </h3>
        {channelName && <p className='truncate text-footnote text-muted-foreground'>{channelName}</p>}
        <p className='truncate text-footnote text-muted-foreground'>
          {dateLabel}
          {sizeLabel && ` · ${sizeLabel}`}
        </p>
      </div>
    </Link>
  )
}

export function FailedRecordingRow({ rec }: { rec: Recording }) {
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
          <span className='truncate font-mono text-subheadline font-semibold text-foreground'>{rec.title}</span>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusChip variant='err' size='sm'>
              FAIL
            </StatusChip>
            <span className='font-mono text-caption text-muted-foreground'>{rec.channelId}</span>
            <span className='font-mono text-caption text-muted-foreground'>{dateLabel}</span>
            <span className='font-mono text-caption text-destructive'>{open ? '▲ LOG' : '▼ LOG'}</span>
          </div>
        </div>
      </button>
      {open && (
        <div className='border-t border-border bg-muted/40 px-4 py-2 pl-[19px]'>
          <p className='font-mono text-caption2 text-destructive'>ERR recording failed</p>
          <p className='font-mono text-caption2 text-muted-foreground'>startedAt: {rec.startedAt}</p>
          {rec.filePath && <p className='font-mono text-caption2 text-muted-foreground'>file: {rec.filePath}</p>}
        </div>
      )}
    </div>
  )
}
