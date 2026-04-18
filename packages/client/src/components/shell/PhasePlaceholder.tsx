import { StatusChip } from '@/components/shared/status-chip'

interface PhasePlaceholderProps {
  title: string
  phase: string
  note?: string
}

export function PhasePlaceholder({ title, phase, note }: PhasePlaceholderProps) {
  return (
    <div className='flex min-h-[200px] flex-col gap-3 p-6 font-mono'>
      <div className='flex items-center gap-2'>
        <StatusChip variant='muted'>SCHED</StatusChip>
        <span className='text-[0.5625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground'>{phase}</span>
      </div>
      <h1 className='text-sm font-bold tracking-[0.05em] text-foreground'>{title}</h1>
      {note && <p className='text-[0.6875rem] text-muted-foreground'>{note}</p>}
    </div>
  )
}
