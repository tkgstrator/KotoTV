import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { Link } from '@tanstack/react-router'
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
        'group relative block border-b border-border text-foreground no-underline',
        'transition-colors hover:bg-muted/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
    >
      {/* Left type accent stripe */}
      <span
        className='absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[2px]'
        style={{ background: typeColor }}
        aria-hidden
      />

      {/* Narrow: single stacked column / sm+: horizontal row */}
      <div className='flex flex-col pl-4 pr-2 py-1.5 lg:flex-row lg:items-stretch lg:h-[52px] lg:py-0'>
        {/* Channel panel */}
        <div
          className={cn(
            'flex flex-shrink-0 items-baseline gap-1.5 lg:flex-col lg:items-start lg:justify-center lg:gap-0',
            'lg:w-[120px] lg:border-r lg:border-border lg:pr-1.5'
          )}
        >
          <span className='text-caption2 font-bold leading-none' style={{ color: typeColor }}>
            {channel.channelNumber || channel.serviceId}
          </span>
          <span className='text-caption2 leading-[1.2] text-muted-foreground line-clamp-1 lg:mt-0.5 lg:line-clamp-2'>
            {channel.name}
          </span>
        </div>

        {/* Current program */}
        <div className='relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden lg:px-2 lg:py-1 lg:pb-1.5 lg:border-r lg:border-border'>
          {cur ? (
            <>
              <span className='truncate text-footnote font-bold leading-[1.2]'>{cur.title}</span>
              <div className='mt-0.5 flex items-baseline gap-1.5'>
                <span className='text-caption2 leading-none text-muted-foreground'>
                  {formatTimeRange(cur.startAt, cur.endAt)}
                </span>
                {urgent && (
                  <span className='text-caption2 font-semibold leading-none text-destructive'>まもなく終了</span>
                )}
              </div>
              {nextLabel && (
                <span className='mt-0.5 block truncate text-caption2 leading-none text-muted-foreground lg:hidden'>
                  {nextLabel}
                </span>
              )}
            </>
          ) : (
            <span className='text-caption text-muted-foreground'>番組情報なし</span>
          )}

          {/* Progress track — desktop: inside this cell */}
          {cur && (
            <div className='absolute bottom-0 left-0 right-0 hidden h-[2px] bg-muted lg:block'>
              <div
                className={cn('h-full rounded-r-[1px]', urgent ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Next program — hidden on narrow/mobile, shown on lg+ */}
        <div className='hidden min-w-0 flex-1 flex-col justify-center overflow-hidden px-2 py-1 lg:flex'>
          {next ? (
            <>
              <span className='truncate text-caption text-muted-foreground'>{next.title}</span>
              <span className='text-caption2 text-muted-foreground'>{formatTimeRange(next.startAt, next.endAt)}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Progress track — mobile: full-width at the bottom of the link */}
      {cur && (
        <div className='h-[2px] bg-muted lg:hidden'>
          <div
            className={cn('h-full rounded-r-[1px]', urgent ? 'bg-destructive' : 'bg-primary')}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </Link>
  )
}
