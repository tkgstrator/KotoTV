import { fmtBytes, SectHead, type SubStatus, statusVariant } from '@/components/settings/_shared'
import { HealthLogTail } from '@/components/settings/HealthLogTail'
import { StatusChip } from '@/components/shared/status-chip'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

interface DiagRowProps {
  status: SubStatus
  name: string
  detail: string
  sub?: string
  extra?: React.ReactNode
  logTail?: React.ReactNode
}

function DiagRow({ status, name, detail, sub, extra, logTail }: DiagRowProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[4px] border border-border',
        status === 'warn' && 'border-l-[3px] border-l-amber-500',
        status === 'err' && 'border-l-[3px] border-l-destructive'
      )}
    >
      <div className='flex items-start'>
        <div className='flex w-[52px] shrink-0 items-start justify-center border-r border-border/50 px-0 py-[9px]'>
          <StatusChip variant={statusVariant(status)} size='sm'>
            {status.toUpperCase()}
          </StatusChip>
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-1 p-3'>
          <div className='flex items-baseline justify-between gap-2'>
            <div className='min-w-0'>
              <p className='font-sans text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-muted-foreground'>
                {name}
              </p>
              <p className='font-sans text-[0.8125rem] text-foreground'>{detail}</p>
              {sub && <p className='font-sans text-[0.6875rem] text-muted-foreground'>{sub}</p>}
              {extra}
            </div>
          </div>
        </div>
      </div>
      {logTail}
    </div>
  )
}

export function StatusTab() {
  const { data, isError } = useHealth()

  if (isError || !data) {
    return (
      <div className='py-8 text-center font-sans text-[0.8125rem] text-muted-foreground'>
        ヘルスデータを取得できません
      </div>
    )
  }

  const diskPct =
    data.disk.breakdown.total > 0
      ? Math.round(((data.disk.breakdown.total - data.disk.breakdown.free) / data.disk.breakdown.total) * 100)
      : 0

  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 max-[480px]:px-2.5'>
      <SectHead>配信</SectHead>
      <div className='flex flex-col gap-2.5'>
        <DiagRow
          status={data.mirakc.status}
          name='MIRAKC'
          detail={data.mirakc.detail}
          logTail={<HealthLogTail subsystem='mirakc' status={data.mirakc.status} />}
        />
        <DiagRow
          status={data.ffmpeg.status}
          name='FFMPEG'
          detail={data.ffmpeg.detail}
          logTail={<HealthLogTail subsystem='ffmpeg' status={data.ffmpeg.status} />}
        />
        <DiagRow
          status={data.tuners.status}
          name='TUNERS'
          detail={data.tuners.detail}
          logTail={<HealthLogTail subsystem='tuners' status={data.tuners.status} />}
        />
      </div>

      <SectHead>ストレージ</SectHead>
      <DiagRow
        status={data.disk.status}
        name='DISK'
        detail={data.disk.detail}
        sub={`recordings ${fmtBytes(data.disk.breakdown.recordings)} · hls tmp ${fmtBytes(data.disk.breakdown.hlsTmpfs)}`}
        extra={
          <div className='mt-1.5 w-full max-w-[220px]'>
            <div className='h-[3px] overflow-hidden rounded-[1px] bg-muted'>
              <div
                className={cn('h-full', data.disk.status === 'ok' ? 'bg-success' : 'bg-amber-500')}
                style={{ width: `${diskPct}%` }}
              />
            </div>
            {data.disk.status !== 'ok' && (
              <p className='mt-1 font-sans text-[0.6875rem] tabular-nums text-amber-500'>{diskPct}% used</p>
            )}
          </div>
        }
        logTail={null}
      />

      <SectHead>ランタイム</SectHead>
      <DiagRow
        status={data.postgres.status}
        name='POSTGRES'
        detail={data.postgres.detail}
        logTail={<HealthLogTail subsystem='postgres' status={data.postgres.status} />}
      />
    </div>
  )
}
