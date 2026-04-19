import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { usePrograms } from '@/hooks/usePrograms'
import { formatTimeRange, getProgress } from '@/lib/program'
import { cn } from '@/lib/utils'

/**
 * Vertical program list for the currently viewed channel — styled like the
 * YouTube up-next rail. Keeps the live video from stretching to full width
 * (which, on a 16:9 monitor with a header, would overflow vertically) while
 * giving viewers something to look at.
 */
export function UpNextPanel({ channelId }: { channelId: string }) {
  // Pull the next 6 hours of programs so the rail always has enough content
  // to scroll through, even right after a daypart rolls over.
  const now = new Date()
  const horizon = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  const { data, isLoading } = usePrograms({
    channelId,
    startAt: now.toISOString(),
    endAt: horizon.toISOString()
  })

  const programs = data?.programs ?? []

  return (
    <aside aria-label='このチャンネルの番組表' className='flex h-full w-full flex-col overflow-hidden'>
      <div className='flex h-10 shrink-0 items-center border-b border-border px-3 text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground'>
        次の番組
      </div>
      <div className='flex-1 overflow-y-auto [scrollbar-width:thin]'>
        {isLoading && programs.length === 0 ? (
          <div className='flex flex-col gap-2 p-3'>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton
                key={`upnext-skel-${
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no natural id
                  i
                }`}
                className='h-16 w-full rounded'
              />
            ))}
          </div>
        ) : programs.length === 0 ? (
          <div className='p-4 text-center text-[0.75rem] text-muted-foreground'>番組情報がありません</div>
        ) : (
          <ul className='flex flex-col divide-y divide-border'>
            {programs.map((p, idx) => (
              <ProgramRow key={p.id} program={p} isLive={idx === 0} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ProgramRow({
  program,
  isLive
}: {
  program: { id: string; title: string; startAt: string; endAt: string }
  isLive: boolean
}) {
  const progress = isLive ? Math.round(getProgress(program.startAt, program.endAt) * 100) : 0

  return (
    <li className={cn('flex flex-col gap-1 px-3 py-2.5', isLive && 'bg-muted/40')}>
      <div className='flex items-center gap-1.5 font-mono text-[0.6875rem] tabular-nums text-muted-foreground'>
        <span>{format(new Date(program.startAt), 'HH:mm')}</span>
        <span aria-hidden='true'>–</span>
        <span>{format(new Date(program.endAt), 'HH:mm')}</span>
        {isLive && (
          <span
            role='status'
            aria-label='現在放送中'
            className='ml-auto inline-flex items-center gap-1 rounded-sm bg-destructive/15 px-1 text-[0.625rem] font-bold uppercase tracking-wider text-destructive'
          >
            <span aria-hidden='true' className='size-1 rounded-full bg-destructive' />
            LIVE
          </span>
        )}
      </div>
      <div className='line-clamp-2 text-[0.8125rem] font-semibold leading-snug'>{program.title}</div>
      {isLive && (
        <div
          role='progressbar'
          aria-label='番組経過'
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className='mt-0.5 h-0.5 overflow-hidden rounded-sm bg-muted'
        >
          <div className='h-full rounded-sm bg-primary' style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className='sr-only'>{formatTimeRange(program.startAt, program.endAt)}</div>
    </li>
  )
}
