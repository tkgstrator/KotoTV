/**
 * TIER-1 health bar (32px). Wordmark left, status chips right.
 * Data is stubbed — wire to useHealth (Phase 6) when the contract exists.
 */
import { StatusChip } from '@/components/shared/status-chip'

export function HealthBar() {
  return (
    <div
      role='status'
      aria-label='グローバルヘルス'
      className='sticky top-0 z-[70] flex h-[var(--shell-health-bar-h)] shrink-0 items-center overflow-x-auto border-b border-border bg-[oklch(0.10_0.008_247)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    >
      <span className='flex h-full shrink-0 items-center border-r border-border px-3 font-mono text-[0.5625rem] font-black uppercase tracking-[0.14em] text-muted-foreground'>
        TELEMAX
      </span>

      <div className='flex h-full shrink-0 items-center gap-1.5 border-r border-border/50 px-2.5'>
        <span className='font-mono text-[0.4375rem] font-bold uppercase tracking-[0.1em] text-muted-foreground'>
          health
        </span>
        {/* TODO: replace with useHealth() data in Phase 6 */}
        <StatusChip variant='ok'>OK</StatusChip>
      </div>

      <div className='flex-1' />

      <div className='flex h-full shrink-0 items-center gap-2 border-l border-border/50 px-2.5'>
        <span className='font-mono text-[0.4375rem] tracking-[0.06em] text-muted-foreground'>v0.1.0</span>
      </div>
    </div>
  )
}
