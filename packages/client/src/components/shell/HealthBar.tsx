/**
 * TIER-1 health bar (32px). Wordmark left, subsystem chips right.
 * Shares the ['health'] query with the Settings status tab — single fetch,
 * 15s polling, both surfaces stay in sync automatically.
 */
import { StatusChip } from '@/components/shared/status-chip'
import { useHealth } from '@/hooks/useHealth'

type SubStatus = 'ok' | 'warn' | 'err'

function worstStatus(statuses: SubStatus[]): SubStatus {
  if (statuses.includes('err')) return 'err'
  if (statuses.includes('warn')) return 'warn'
  return 'ok'
}

export function HealthBar() {
  const { data } = useHealth()

  const overall: SubStatus = data
    ? worstStatus([data.mirakc.status, data.postgres.status, data.ffmpeg.status, data.tuners.status, data.disk.status])
    : 'ok'

  return (
    <div
      role='status'
      aria-label='グローバルヘルス'
      className='sticky top-0 z-[70] flex h-[var(--shell-health-bar-h)] shrink-0 items-center overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    >
      <span className='flex h-full shrink-0 items-center border-r border-border px-3 font-mono text-[0.8125rem] font-black uppercase tracking-[0.14em] text-foreground'>
        KotoTV
      </span>

      <div className='flex-1' />

      <div className='flex h-full shrink-0 items-center gap-2 border-l border-border/50 px-3'>
        <span className='font-mono text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground'>
          health
        </span>
        <StatusChip variant={overall} size='sm'>
          {overall.toUpperCase()}
        </StatusChip>
      </div>

      <div className='flex h-full shrink-0 items-center gap-2 border-l border-border/50 px-3'>
        <span className='font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground'>v0.1.0</span>
      </div>
    </div>
  )
}
