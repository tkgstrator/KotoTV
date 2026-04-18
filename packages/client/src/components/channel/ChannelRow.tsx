import { Link } from '@tanstack/react-router'
import type { Channel } from '@telemax/server/src/schemas/Channel.dto'
import { formatTimeRange, getProgress, getRemainingLabel, pickNextLabel } from '@/lib/program'
import { cn } from '@/lib/utils'

const TYPE_COLORS: Record<Channel['type'], string> = {
  GR: 'oklch(0.6 0.18 247)',
  BS: 'oklch(0.6 0.18 150)',
  CS: 'oklch(0.7 0.18 65)',
  SKY: 'oklch(0.65 0.18 300)'
}

interface ChannelRowProps {
  channel: Channel
}

export function ChannelRow({ channel }: ChannelRowProps) {
  const { currentProgram: cur, nextProgram: next } = channel
  const progress = cur ? getProgress(cur.startAt, cur.endAt) : 0
  const urgent = cur ? getRemainingLabel(cur.endAt) !== null : false
  const nextLabel = pickNextLabel(next)
  const typeColor = TYPE_COLORS[channel.type]

  return (
    <Link
      to='/live/$channelId'
      params={{ channelId: channel.id }}
      aria-label={`${channel.name} を視聴`}
      className={cn(
        'group relative flex items-stretch border-b border-border text-foreground no-underline',
        'transition-colors hover:bg-muted/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        /* mobile: 60px row / desktop: 52px row */
        'h-[60px] md:h-[52px]'
      )}
    >
      {/* Left type accent stripe */}
      <span
        className='absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[2px]'
        style={{ background: typeColor }}
        aria-hidden
      />

      {/* Channel panel — 72px mobile, 56px desktop */}
      <div
        className={cn(
          'flex flex-shrink-0 flex-col justify-center border-r border-border pl-4 pr-1.5',
          'w-[72px] md:w-[56px]'
        )}
      >
        <span className='text-[0.65rem] font-bold leading-none' style={{ color: typeColor }}>
          {channel.channelNumber || channel.serviceId}
        </span>
        <span className='mt-0.5 text-[0.6rem] leading-[1.2] text-muted-foreground line-clamp-2'>{channel.name}</span>
      </div>

      {/* Current program — takes flex-1 on mobile, fixed 1fr on desktop */}
      <div className='relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden px-2 py-1 pb-1.5 md:border-r md:border-border'>
        {cur ? (
          <>
            <span className='truncate text-[0.75rem] font-bold leading-[1.2]'>{cur.title}</span>
            <div className='mt-0.5 flex items-baseline gap-1.5'>
              <span className='text-[0.6rem] leading-none text-muted-foreground'>
                {formatTimeRange(cur.startAt, cur.endAt)}
              </span>
              {urgent && (
                <span className='text-[0.6rem] font-semibold leading-none text-destructive'>まもなく終了</span>
              )}
            </div>
            {/* Mobile-only next label — inline on its own row so it doesn't collide with time */}
            {nextLabel && (
              <span className='mt-0.5 block truncate text-[0.6rem] leading-none text-muted-foreground md:hidden'>
                {nextLabel}
              </span>
            )}
          </>
        ) : (
          <span className='text-[0.7rem] text-muted-foreground'>番組情報なし</span>
        )}

        {/* Progress track at bottom */}
        {cur && (
          <div className='absolute bottom-0 left-0 right-0 h-[2px] bg-muted'>
            <div
              className={cn('h-full rounded-r-[1px]', urgent ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Next program — hidden on mobile, shown on md+ */}
      <div className='hidden min-w-0 flex-1 flex-col justify-center overflow-hidden px-2 py-1 md:flex'>
        {next ? (
          <>
            <span className='truncate text-[0.7rem] text-muted-foreground'>{next.title}</span>
            <span className='text-[0.6rem] text-muted-foreground'>{formatTimeRange(next.startAt, next.endAt)}</span>
          </>
        ) : null}
      </div>
    </Link>
  )
}
