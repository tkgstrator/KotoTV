import { CalendarPlus } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RecordingScheduleForm } from './RecordingScheduleForm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shared reservation affordances for every `/recordings/*` list page:
 * mobile FAB, ⌘K hotkey, and the reservation form. Each page owns the
 * `open` state so its empty-state button can toggle it too.
 */
export function RecordingsReserveAction({ open, onOpenChange }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange])

  return (
    <>
      <Button
        size='sm'
        className='fixed bottom-[calc(var(--mobile-nav-h)+12px)] right-4 z-20 h-10 gap-1.5 rounded-full px-4 font-mono text-footnote font-bold shadow-lg sm:hidden'
        onClick={() => onOpenChange(true)}
        aria-label='新規予約'
      >
        <CalendarPlus className='size-4' />
        RESERVE
      </Button>
      <RecordingScheduleForm open={open} onOpenChange={onOpenChange} />
    </>
  )
}
