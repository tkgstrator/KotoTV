import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { useNavigate } from '@tanstack/react-router'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useCreateRecording } from '@/hooks/useRecordings'
import { formatTimeRange } from '@/lib/program'

interface ProgramDetailDialogProps {
  program: Program | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProgramDetailDialog({ program, open, onOpenChange }: ProgramDetailDialogProps) {
  const navigate = useNavigate()
  const createRecording = useCreateRecording()

  function handleWatch() {
    if (!program) return
    onOpenChange(false)
    navigate({ to: '/live/$channelId', params: { channelId: program.channelId } })
  }

  function handleRecord() {
    if (!program) return
    createRecording.mutate(
      {
        channelId: program.channelId,
        programId: program.id,
        title: program.title,
        startAt: program.startAt,
        endAt: program.endAt
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg overflow-hidden p-0'>
        <div className='flex flex-col gap-4 p-6'>
          <DialogHeader>
            <DialogTitle className='pr-6 leading-[1.4] text-foreground'>{program?.title ?? ''}</DialogTitle>
            {program && (
              <p className='font-mono text-[0.6875rem] tabular-nums text-muted-foreground'>
                {formatTimeRange(program.startAt, program.endAt)}
              </p>
            )}
            {program && program.genres.length > 0 && (
              <div className='flex flex-wrap gap-1 pt-0.5'>
                {program.genres.map((genre) => (
                  <StatusChip key={genre} variant='muted' size='sm'>
                    {genre}
                  </StatusChip>
                ))}
                {program.isRecordable && (
                  <StatusChip variant='sched' size='sm'>
                    予約可
                  </StatusChip>
                )}
              </div>
            )}
          </DialogHeader>

          <DialogDescription asChild>
            <div className='max-h-40 overflow-y-auto text-[0.8125rem] leading-relaxed text-muted-foreground [scrollbar-width:thin]'>
              {program?.description ? program.description : <span className='italic'>番組概要はありません</span>}
            </div>
          </DialogDescription>

          <DialogFooter>
            {program?.isRecordable && (
              <Button
                variant='outline'
                type='button'
                disabled={createRecording.isPending}
                onClick={handleRecord}
                aria-label={`${program.title} を録画予約`}
              >
                {createRecording.isPending ? '予約中…' : '録画予約'}
              </Button>
            )}
            <Button
              type='button'
              onClick={handleWatch}
              aria-label={program ? `${program.title} を視聴する` : '視聴する'}
            >
              視聴する
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
