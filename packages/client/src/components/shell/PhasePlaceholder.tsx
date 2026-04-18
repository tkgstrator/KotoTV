import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from './PageHeader'

interface PhasePlaceholderProps {
  title: string
  phase: string
  note?: string
}

export function PhasePlaceholder({ title, phase, note }: PhasePlaceholderProps) {
  return (
    <>
      <PageHeader ariaLabel={`${title} (${phase})`}>
        <div className='flex h-full w-full items-center gap-3 px-4 font-mono'>
          <h1 className='text-base font-bold tracking-[0.05em] text-foreground'>{title}</h1>
          <StatusChip variant='muted' size='sm'>
            SCHED
          </StatusChip>
          <span className='text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground'>{phase}</span>
        </div>
      </PageHeader>
      {note && (
        <div className='p-6 font-mono'>
          <p className='text-[0.75rem] text-muted-foreground'>{note}</p>
        </div>
      )}
    </>
  )
}
