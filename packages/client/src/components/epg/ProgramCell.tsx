import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { Link } from '@tanstack/react-router'
import { StatusChip } from '@/components/shared/status-chip'
import { formatTimeRange, genreToColor } from '@/lib/program'
import { cn } from '@/lib/utils'

interface ProgramCellProps {
  program: Program
  className?: string
}

export function ProgramCell({ program, className }: ProgramCellProps) {
  const primaryGenre = program.genres[0] ?? 'その他'
  const accentColor = genreToColor(primaryGenre)

  return (
    <Link
      to='/live/$channelId'
      params={{ channelId: program.channelId }}
      aria-label={`${program.title} ${formatTimeRange(program.startAt, program.endAt)}`}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-[2px] border-l-[3px] bg-[var(--genre-color)]/10 p-[3px_5px] outline-none',
        'hover:bg-[var(--genre-color)]/18',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
      style={{ '--genre-color': accentColor, borderLeftColor: accentColor } as React.CSSProperties}
    >
      <span className='line-clamp-2 text-[0.6875rem] font-bold leading-[1.3] text-foreground'>{program.title}</span>
      <span className='mt-[2px] font-mono text-[0.55rem] tabular-nums text-muted-foreground'>
        {formatTimeRange(program.startAt, program.endAt)}
      </span>
      <div className='mt-1 flex flex-wrap gap-1'>
        <StatusChip variant='muted' size='sm'>
          {primaryGenre}
        </StatusChip>
        {program.isRecordable && (
          <StatusChip variant='sched' size='sm'>
            予約
          </StatusChip>
        )}
      </div>
    </Link>
  )
}
