import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface Chapter {
  seconds: number
  title: string
}

interface SeekbarChaptersProps {
  chapters: Chapter[]
  duration: number
  className?: string
}

/**
 * Renders chapter tick marks overlaid on the seekbar.
 * Positioned absolutely so it must live inside a relative container
 * (the seekbar track div). Each tick is a 2px vertical line with a
 * tooltip on hover/focus.
 */
export function SeekbarChapters({ chapters, duration, className }: SeekbarChaptersProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!duration || duration <= 0) return null

  return (
    <div aria-hidden='true' className={cn('pointer-events-none absolute inset-0', className)}>
      {chapters.map((chapter, idx) => {
        const pct = (chapter.seconds / duration) * 100
        const isHovered = hoveredIdx === idx

        return (
          <button
            key={chapter.seconds}
            type='button'
            tabIndex={-1}
            aria-label={chapter.title}
            className='pointer-events-auto absolute top-0 h-full cursor-default bg-transparent border-none p-0'
            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            onFocus={() => setHoveredIdx(idx)}
            onBlur={() => setHoveredIdx(null)}
          >
            {/* tick line */}
            <div className='mx-auto w-[2px] h-full bg-foreground/40 rounded-full' />

            {/* tooltip */}
            {isHovered && (
              <div
                className={cn(
                  'absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
                  'whitespace-nowrap rounded-sm border border-border bg-card px-1.5 py-0.5',
                  'font-mono text-[0.5625rem] font-bold text-foreground shadow-md z-10'
                )}
              >
                {chapter.title}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
