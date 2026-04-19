import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { Link } from '@tanstack/react-router'
import { CalendarPlus } from 'lucide-react'
import { StatusChip } from '@/components/shared/status-chip'
import { formatTimeRange, genreToColor } from '@/lib/program'
import { cn } from '@/lib/utils'

interface ProgramCellProps {
  program: Program
  className?: string
  /** Opens the reservation dialog pre-filled with this program. When omitted,
   *  the 予約 button is hidden. */
  onReserve?: ((program: Program) => void) | undefined
}

export function ProgramCell({ program, className, onReserve }: ProgramCellProps) {
  const primaryGenre = program.genres[0] ?? 'その他'
  const accentColor = genreToColor(primaryGenre)

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden',
        'border border-border border-l-[3px] bg-card',
        'hover:bg-[var(--genre-color)]/12',
        // Subtle hover lift — CSS is simpler here than a motion wrapper and avoids
        // the typed MotionStyle vs React.CSSProperties friction for custom props.
        'transition-transform duration-150 ease-out hover:z-10 hover:scale-[1.02]',
        className
      )}
      style={{ '--genre-color': accentColor, borderLeftColor: accentColor } as React.CSSProperties}
    >
      <Link
        to='/live/$channelId'
        params={{ channelId: program.channelId }}
        aria-label={`${program.title} ${formatTimeRange(program.startAt, program.endAt)}`}
        className={cn(
          'flex h-full flex-col overflow-hidden p-[3px_5px] outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
        )}
      >
        <span className='line-clamp-2 text-[0.8125rem] font-bold leading-[1.3] text-foreground'>{program.title}</span>
        <span className='mt-[3px] font-mono text-[0.625rem] tabular-nums text-muted-foreground'>
          {formatTimeRange(program.startAt, program.endAt)}
        </span>
        <div className='mt-1 flex flex-wrap gap-1'>
          <StatusChip variant='muted' size='sm'>
            {primaryGenre}
          </StatusChip>
        </div>
      </Link>

      {/* Reserve button — absolute top-right, shown on hover / focus so it doesn't
          compete with the title. Stops the Link navigation via its own button. */}
      {onReserve && (
        <button
          type='button'
          aria-label={`${program.title} を録画予約`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReserve(program)
          }}
          className={cn(
            'absolute right-1 top-1 flex size-5 items-center justify-center rounded-sm border border-border/60 bg-card/90 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity',
            'hover:border-primary/40 hover:text-primary focus-visible:opacity-100',
            'group-hover:opacity-100'
          )}
        >
          <CalendarPlus className='size-3' aria-hidden />
        </button>
      )}
    </div>
  )
}
