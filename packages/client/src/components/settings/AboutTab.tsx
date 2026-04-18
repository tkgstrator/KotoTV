import { SectHead } from '@/components/settings/_shared'
import { StatusChip } from '@/components/shared/status-chip'
import { cn } from '@/lib/utils'

const ABOUT_ROWS = [
  { key: 'version', val: '0.1.0' },
  { key: 'commit', val: 'dev' },
  { key: 'built', val: '—' },
  { key: 'bun', val: typeof Bun !== 'undefined' ? Bun.version : '—' }
]

const LINK_ROWS: { key: string; val: string; href: string | null }[] = [
  { key: 'repo', val: 'tkgstrator/KotoTV', href: 'https://github.com/tkgstrator/KotoTV' },
  { key: 'license', val: 'MIT License', href: 'https://github.com/tkgstrator/KotoTV/blob/master/LICENSE' },
  { key: 'desc', val: 'KotoTV — 外出先ライブ視聴クライアント', href: null }
]

export function AboutTab() {
  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 max-[480px]:px-2.5'>
      <SectHead>バージョン</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        {ABOUT_ROWS.map(({ key, val }, i) => (
          <div key={key} className={cn('flex gap-0', i < ABOUT_ROWS.length - 1 && 'border-b border-border/60')}>
            <td className='w-[100px] shrink-0 px-3 py-1.5 font-sans text-[0.75rem] font-semibold text-muted-foreground'>
              {key}
            </td>
            <td className='px-3 py-1.5 font-sans text-[0.75rem] text-foreground'>
              {val}
              {key === 'version' && (
                <StatusChip variant='info' size='sm' className='ml-1.5'>
                  DEV
                </StatusChip>
              )}
            </td>
          </div>
        ))}
      </div>

      <SectHead>リンク</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        {LINK_ROWS.map(({ key, val, href }, i) => (
          <div key={key} className={cn('flex gap-0', i < LINK_ROWS.length - 1 && 'border-b border-border/60')}>
            <td className='w-[100px] shrink-0 px-3 py-1.5 font-sans text-[0.75rem] font-semibold text-muted-foreground'>
              {key}
            </td>
            <td className='px-3 py-1.5 font-sans text-[0.75rem]'>
              {href ? (
                <a
                  href={href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                >
                  {val}
                </a>
              ) : (
                <span className='text-muted-foreground'>{val}</span>
              )}
            </td>
          </div>
        ))}
      </div>
    </div>
  )
}
