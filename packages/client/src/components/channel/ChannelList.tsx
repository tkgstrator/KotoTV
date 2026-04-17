import type { Channel, ChannelType } from '@telemax/server/src/schemas/Channel.dto'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import { ChannelRow } from './ChannelRow'

const TYPE_LABELS: Record<Channel['type'], string> = {
  GR: '地上波 GR',
  BS: 'BS',
  CS: 'CS',
  SKY: 'SKY'
}

const TYPE_COLORS: Record<Channel['type'], string> = {
  GR: 'oklch(0.6 0.18 247)',
  BS: 'oklch(0.6 0.18 150)',
  CS: 'oklch(0.7 0.18 65)',
  SKY: 'oklch(0.65 0.18 300)'
}

const TYPE_ORDER: Channel['type'][] = ['GR', 'BS', 'CS', 'SKY']

function SectionHeader({ type }: { type: Channel['type'] }) {
  return (
    <div className='sticky top-12 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5'>
      <span className='h-2 w-2 flex-shrink-0 rounded-full' style={{ background: TYPE_COLORS[type] }} aria-hidden />
      <span className='text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground'>
        {TYPE_LABELS[type]}
      </span>
    </div>
  )
}

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
        <div key={i} className='flex h-[60px] items-center gap-3 border-b border-border px-3 md:h-[52px]'>
          <Skeleton className='h-8 w-[56px] flex-shrink-0 rounded' />
          <div className='flex flex-1 flex-col gap-1.5'>
            <Skeleton className='h-3 w-3/4 rounded' />
            <Skeleton className='h-2 w-1/3 rounded' />
          </div>
        </div>
      ))}
    </>
  )
}

interface ChannelListProps {
  type?: ChannelType
}

export function ChannelList({ type }: ChannelListProps) {
  const { data, isPending, isError } = useChannels(type)

  if (isPending) {
    return (
      <div>
        <SkeletonRows count={12} />
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
        <p className='text-sm font-medium text-destructive'>サーバーに接続できません</p>
        <p className='text-xs text-muted-foreground'>mirakc が起動しているか確認してください</p>
      </div>
    )
  }

  const channels = data?.channels ?? []

  if (channels.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
        <p className='text-sm text-muted-foreground'>チャンネルが見つかりません</p>
      </div>
    )
  }

  if (type) {
    // Single-type view — no section headers, just the rows in a 2-col grid on desktop
    return (
      <ul className='grid grid-cols-1 md:grid-cols-2'>
        {channels.map((ch) => (
          <li key={ch.id}>
            <ChannelRow channel={ch} />
          </li>
        ))}
      </ul>
    )
  }

  // ALL view — grouped by type with section headers
  const grouped = TYPE_ORDER.reduce<Record<string, Channel[]>>((acc, t) => {
    const list = channels.filter((ch) => ch.type === t)
    if (list.length > 0) acc[t] = list
    return acc
  }, {})

  return (
    <div>
      {(Object.entries(grouped) as [Channel['type'], Channel[]][]).map(([t, list]) => (
        <section key={t} aria-label={TYPE_LABELS[t]}>
          <SectionHeader type={t} />
          <ul className='grid grid-cols-1 md:grid-cols-2'>
            {list.map((ch) => (
              <li key={ch.id}>
                <ChannelRow channel={ch} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
