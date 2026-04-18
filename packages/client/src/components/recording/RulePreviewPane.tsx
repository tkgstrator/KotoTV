import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { StatusChip } from '@/components/shared/status-chip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecordingRulePreview } from '@/hooks/useRecordingRules'
import type { CreateRecordingRule } from '@/types/RecordingRule'

interface RulePreviewPaneProps {
  rule: CreateRecordingRule | null
}

function highlightKeyword(text: string, keyword: string | null | undefined): React.ReactNode {
  if (!keyword) return text
  try {
    const re = new RegExp(`(${keyword})`, 'gi')
    const parts = text.split(re)
    return parts.map((part, i) =>
      re.test(part) ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable split index
        <mark key={i} className='bg-primary/25 text-foreground rounded-sm px-[1px]'>
          {part}
        </mark>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable split index
        <span key={i}>{part}</span>
      )
    )
  } catch {
    return text
  }
}

export function RulePreviewPane({ rule }: RulePreviewPaneProps) {
  const { data, isPending, isError } = useRecordingRulePreview(rule)

  if (!rule) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 p-6'>
        <p className='font-mono text-[0.6875rem] text-muted-foreground'>$ fill in keyword or channels to preview</p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className='flex flex-col gap-2 p-4'>
        <Skeleton className='h-8 w-32 rounded' />
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
          <Skeleton key={i} className='h-12 w-full rounded' />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className='p-4'>
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 font-mono text-[0.75rem] text-destructive'>
          ERR プレビュー取得失敗 (invalid regex or server error)
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className='flex h-full flex-col gap-3 p-4'>
      <div className='flex items-center gap-3'>
        <StatusChip variant='info' className='text-base px-3 py-1.5 text-[0.9375rem]'>
          {data.matchCount} 件ヒット
        </StatusChip>
        <span className='font-mono text-[0.625rem] text-muted-foreground'>この週内の番組</span>
      </div>

      {data.programs.length === 0 ? (
        <p className='font-mono text-[0.6875rem] text-muted-foreground'>$ no matches — loosen keyword or channels</p>
      ) : (
        <ScrollArea className='flex-1'>
          <div className='flex flex-col'>
            {data.programs.map((p) => {
              const start = new Date(p.startAt)
              const end = new Date(p.endAt)
              const timeLabel = `${format(start, 'M/d(EEE) HH:mm', { locale: ja })}〜${format(end, 'HH:mm', { locale: ja })}`

              return (
                <div
                  key={`${p.channelId}-${p.programId}`}
                  className='flex flex-col gap-0.5 border-b border-border px-1 py-2'
                >
                  <div className='flex items-center gap-2'>
                    <span className='shrink-0 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[0.5625rem] font-bold text-primary'>
                      {p.channelName}
                    </span>
                    <span className='font-mono text-[0.625rem] text-muted-foreground'>{timeLabel}</span>
                  </div>
                  <p className='font-mono text-[0.75rem] font-semibold text-foreground'>
                    {highlightKeyword(p.title, rule.keyword)}
                  </p>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
