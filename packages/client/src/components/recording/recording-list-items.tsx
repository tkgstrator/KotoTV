import type { Recording, RecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { Link, useNavigate } from '@tanstack/react-router'
import { format, intervalToDuration, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Film, Play, Trash2 } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
          className='h-7 gap-1 px-2 text-caption font-bold text-destructive hover:bg-destructive/10 hover:text-destructive'
          disabled={isPending}
          aria-label='予約キャンセル'
        >
          <Trash2 className='size-3' />
          取消
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>予約を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='text-footnote'>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant='destructive' className='text-footnote' onClick={() => mutate(scheduleId)}>
            削除
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
  const startLabel = format(parseISO(schedule.startAt), 'yyyy-MM-dd HH:mm', { locale: ja })
  const endLabel = format(parseISO(schedule.endAt), 'HH:mm', { locale: ja })
  const durationMs = parseISO(schedule.endAt).getTime() - parseISO(schedule.startAt).getTime()
  const durationMin = Math.round(durationMs / 60_000)
  const h = Math.floor(durationMin / 60)
  const m = durationMin % 60
  const durationLabel = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
  const ruleId = (schedule as { ruleId?: string | null }).ruleId
  const ruleName = ruleId ? ruleNameMap.get(ruleId) : null
  const isFailed = schedule.status === 'failed'

  return (
    <div className='flex items-start gap-2 border-b border-border px-3 py-2 transition-colors hover:bg-muted/30'>
      <div
        className={`mt-[3px] w-[3px] flex-shrink-0 self-stretch rounded-full ${isFailed ? 'bg-destructive/50' : 'bg-amber-500'}`}
      />
      <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
        <span className='truncate text-subheadline font-semibold text-foreground'>{schedule.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          {isFailed ? (
            <StatusChip variant='err' size='sm'>
              失敗
            </StatusChip>
          ) : schedule.status === 'recording' ? (
            <StatusChip variant='rec' dot size='sm'>
              録画中
            </StatusChip>
          ) : (
            <StatusChip variant='sched' size='sm'>
              予約
            </StatusChip>
          )}
          <span className='text-caption text-muted-foreground'>{schedule.channelId}</span>
          <span className='text-caption text-muted-foreground'>
            {startLabel}〜{endLabel}
          </span>
          <span className='text-caption text-muted-foreground'>{durationLabel}</span>
          {ruleId && ruleName ? (
            <Link to='/recordings/rules/$id' params={{ id: ruleId }}>
              <StatusChip variant='info' size='sm' className='cursor-pointer hover:opacity-80'>
                ルール: {ruleName}
              </StatusChip>
            </Link>
          ) : ruleId ? (
            <StatusChip variant='info' size='sm'>
              ルール
            </StatusChip>
          ) : (
            <StatusChip variant='muted' size='sm'>
              手動
            </StatusChip>
          )}
          {isFailed && (schedule as { failureReason?: string | null }).failureReason && (
            <span className='text-caption2 text-destructive'>
              {(schedule as { failureReason?: string | null }).failureReason}
            </span>
          )}
        </div>
      </div>
      {!isFailed && (
        <div className='flex shrink-0 items-center gap-1'>
          <DeleteScheduleButton scheduleId={schedule.id} />
        </div>
      )}
    </div>
  )
}

export function RecordingRow({ rec }: { rec: Recording }) {
  const elapsed = rec.startedAt
    ? `${Math.round((Date.now() - parseISO(rec.startedAt).getTime()) / 60_000)} 分経過`
    : null
  const pct =
    rec.durationSec && rec.startedAt
      ? Math.min(100, ((Date.now() - parseISO(rec.startedAt).getTime()) / (rec.durationSec * 1000)) * 100)
      : null

  return (
    <div className='flex items-start gap-2 border-b border-border px-3 py-2 transition-colors hover:bg-muted/30'>
      <div className='mt-[3px] w-[3px] flex-shrink-0 self-stretch rounded-full bg-destructive' />
      <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
        <span className='truncate text-subheadline font-semibold text-foreground'>{rec.title}</span>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusChip variant='rec' dot size='sm'>
            録画中
          </StatusChip>
          <span className='text-caption text-muted-foreground'>{rec.channelId}</span>
          {elapsed && <span className='text-caption text-destructive'>{elapsed}</span>}
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
  channelName?: string | undefined
}

export function DoneCard({ rec, channelName }: DoneCardProps) {
  const [open, setOpen] = useState(false)
  const dateLabel = rec.endedAt ? format(parseISO(rec.endedAt), 'yyyy/M/d', { locale: ja }) : '—'
  const startLabel = rec.startedAt ? format(parseISO(rec.startedAt), 'yyyy/M/d HH:mm', { locale: ja }) : '—'
  const endLabel = rec.endedAt ? format(parseISO(rec.endedAt), 'HH:mm', { locale: ja }) : '—'
  const durationLabel = rec.durationSec ? formatDuration(rec.durationSec) : null
  const sizeLabel = rec.sizeBytes ? formatBytes(rec.sizeBytes) : null
  const navigate = useNavigate()

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='group flex flex-col gap-2 text-left focus-visible:outline-none'
      >
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
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-md gap-5'>
          <DialogHeader>
            <DialogTitle className='text-base leading-snug'>{rec.title}</DialogTitle>
            <DialogDescription asChild>
              <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-footnote'>
                <dt className='text-muted-foreground'>チャンネル</dt>
                <dd>{channelName ?? rec.channelId}</dd>
                <dt className='text-muted-foreground'>放送日時</dt>
                <dd>
                  {startLabel}〜{endLabel}
                </dd>
                {durationLabel && (
                  <>
                    <dt className='text-muted-foreground'>録画時間</dt>
                    <dd className='tabular-nums'>{durationLabel}</dd>
                  </>
                )}
                {sizeLabel && (
                  <>
                    <dt className='text-muted-foreground'>ファイルサイズ</dt>
                    <dd className='tabular-nums'>{sizeLabel}</dd>
                  </>
                )}
              </dl>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex-col gap-2 sm:flex-col'>
            <Button
              className='w-full gap-2'
              onClick={() => {
                setOpen(false)
                navigate({ to: '/recordings/$id', params: { id: rec.id } })
              }}
            >
              <Play className='size-4' />
              再生
            </Button>
            <div className='flex gap-2'>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='flex-1'>
                      <Button variant='outline' className='w-full gap-2' disabled>
                        <Film className='size-4' />
                        エンコード
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>今後のアップデートで対応予定</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='flex-1'>
                      <Button variant='destructive' className='w-full gap-2' disabled>
                        <Trash2 className='size-4' />
                        削除
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>今後のアップデートで対応予定</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function FailedRecordingRow({ rec }: { rec: Recording }) {
  const [open, setOpen] = useState(false)
  const dateLabel = rec.startedAt ? format(parseISO(rec.startedAt), 'yyyy-MM-dd HH:mm', { locale: ja }) : '—'

  return (
    <div className='border-b border-border'>
      <button
        type='button'
        className='flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className='mt-[3px] w-[3px] flex-shrink-0 self-stretch rounded-full bg-destructive/50' />
        <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
          <span className='truncate text-subheadline font-semibold text-foreground'>{rec.title}</span>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusChip variant='err' size='sm'>
              失敗
            </StatusChip>
            <span className='text-caption text-muted-foreground'>{rec.channelId}</span>
            <span className='text-caption text-muted-foreground'>{dateLabel}</span>
            <span className='text-caption text-destructive'>{open ? '▲ ログ' : '▼ ログ'}</span>
          </div>
        </div>
      </button>
      {open && (
        <div className='border-t border-border bg-muted/40 px-4 py-2 pl-[19px]'>
          <p className='text-caption2 text-destructive'>録画に失敗しました</p>
          <p className='text-caption2 text-muted-foreground'>開始時刻: {rec.startedAt}</p>
          {rec.filePath && <p className='text-caption2 text-muted-foreground'>ファイル: {rec.filePath}</p>}
        </div>
      )}
    </div>
  )
}
