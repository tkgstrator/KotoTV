import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Subsystem } from '@/hooks/useHealth'
import { useHealthLogs } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

interface HealthLogTailProps {
  subsystem: Subsystem
  status: 'ok' | 'warn' | 'err'
}

function levelClass(level: string): string {
  switch (level) {
    case 'error':
      return 'text-destructive'
    case 'warn':
      return 'text-amber-500'
    case 'debug':
      return 'opacity-60 text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

export function HealthLogTail({ subsystem, status }: HealthLogTailProps) {
  const isWarningOrError = status === 'warn' || status === 'err'
  const [open, setOpen] = useState(isWarningOrError)

  const { data, isFetching } = useHealthLogs(open ? subsystem : undefined)
  const lines = data?.lines ?? []

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className='border-t border-border bg-muted/20'>
        <CollapsibleTrigger className='flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 font-mono text-[0.5625rem] font-bold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'>
          <ChevronRight
            className={cn('size-2.5 shrink-0 transition-transform duration-100', open && 'rotate-90')}
            aria-hidden='true'
          />
          ログ
          {isFetching && <span className='opacity-60'>(loading)</span>}
          {!isFetching && lines.length > 0 && <span className='opacity-60'>({lines.length})</span>}
          {isWarningOrError && (
            <span className={cn('ml-1', status === 'err' ? 'text-destructive' : 'text-amber-500')}>
              — {status.toUpperCase()}
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className='px-3 pb-2'>
            {lines.length === 0 && !isFetching && (
              <p className='py-1 font-mono text-[0.5625rem] text-muted-foreground'>ログなし</p>
            )}
            {lines.map((line, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable key
                key={i}
                className='flex gap-2 py-[1px] font-mono text-[0.5625rem]'
              >
                <span className='shrink-0 text-muted-foreground/60'>{line.ts}</span>
                <span className={cn('shrink-0 font-bold', levelClass(line.level))}>[{line.level.toUpperCase()}]</span>
                <span className={cn('min-w-0 break-words', levelClass(line.level))}>{line.message}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
