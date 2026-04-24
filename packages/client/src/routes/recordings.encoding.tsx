import { createFileRoute } from '@tanstack/react-router'
import { format, subMinutes } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { PageHeader } from '@/components/shell/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/recordings/encoding')({
  component: EncodePage
})

// ─── Dummy queue ────────────────────────────────────────────────────────────
//
// The transcode worker isn't wired up yet; show a plausible queue so the
// layout isn't empty. Each entry roughly mirrors the shape we expect the
// API to return once the worker ships.

type EncodeStatus = 'encoding' | 'waiting'

interface EncodeJob {
  id: string
  title: string
  channel: string
  sourceCodec: string
  sourceSizeMB: number
  targetCodec: 'AVC' | 'HEVC'
  targetSizeMB: number
  /** Minutes ago the job started (only meaningful when status === 'encoding'). */
  startedMinutesAgo?: number
  /** Minutes until completion (only meaningful when status === 'encoding'). */
  etaMinutes?: number
  /** 0–1 progress (only meaningful when status === 'encoding'). */
  progress?: number
  status: EncodeStatus
  /** Queue position starting at 1 (only meaningful when status === 'waiting'). */
  queuePos?: number
}

const DUMMY_JOBS: readonly EncodeJob[] = [
  {
    id: 'enc-1',
    title: 'クローズアップ現代 「AI 時代の医療革命」',
    channel: 'NHK総合1',
    sourceCodec: 'MPEG-2 TS',
    sourceSizeMB: 6_400,
    targetCodec: 'HEVC',
    targetSizeMB: 960,
    status: 'encoding',
    startedMinutesAgo: 12,
    etaMinutes: 8,
    progress: 0.6
  },
  {
    id: 'enc-2',
    title: '報道ステーション',
    channel: 'テレビ朝日',
    sourceCodec: 'MPEG-2 TS',
    sourceSizeMB: 12_300,
    targetCodec: 'HEVC',
    targetSizeMB: 1_850,
    status: 'waiting',
    queuePos: 1
  },
  {
    id: 'enc-3',
    title: '深夜アニメ枠 第 8 話「夜明けまで」',
    channel: 'TOKYO MX',
    sourceCodec: 'MPEG-2 TS',
    sourceSizeMB: 4_900,
    targetCodec: 'AVC',
    targetSizeMB: 820,
    status: 'waiting',
    queuePos: 2
  },
  {
    id: 'enc-4',
    title: 'ガイアの夜明け「町工場 X 世界市場」',
    channel: 'テレビ東京',
    sourceCodec: 'MPEG-2 TS',
    sourceSizeMB: 11_200,
    targetCodec: 'HEVC',
    targetSizeMB: 1_700,
    status: 'waiting',
    queuePos: 3
  },
  {
    id: 'enc-5',
    title: '映像詩 にっぽんの風景',
    channel: 'NHK BS',
    sourceCodec: 'H.264',
    sourceSizeMB: 9_800,
    targetCodec: 'HEVC',
    targetSizeMB: 1_400,
    status: 'waiting',
    queuePos: 4
  }
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function etaLabel(minutes: number): string {
  if (minutes < 60) return `残り ${minutes} 分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `残り ${h} 時間 ${m} 分` : `残り ${h} 時間`
}

// ─── Row ────────────────────────────────────────────────────────────────────

function EncodeRow({ job }: { job: EncodeJob }) {
  const isActive = job.status === 'encoding'
  const percent = job.progress != null ? Math.round(job.progress * 100) : 0
  const startedAt = isActive && job.startedMinutesAgo != null ? subMinutes(new Date(), job.startedMinutesAgo) : null
  const startedLabel = startedAt ? `${format(startedAt, 'HH:mm', { locale: ja })} 開始` : null

  return (
    <div className='flex items-stretch border-b border-border bg-card last:border-b-0'>
      {/* Status accent — active jobs get the primary accent, queued ones
          get a muted stripe so the eye lands on what's actually
          running. */}
      <div className={cn('w-[3px] shrink-0', isActive ? 'bg-primary' : 'bg-muted-foreground/30')} />

      <div className='flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3'>
        {/* Top row: status chip + title + target codec */}
        <div className='flex items-baseline gap-2'>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption2 font-bold uppercase tracking-[0.08em]',
              isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            {isActive ? (
              <>
                <span aria-hidden='true' className='inline-block size-1.5 animate-pulse rounded-full bg-primary' />
                エンコード中
              </>
            ) : (
              <>待機 #{job.queuePos}</>
            )}
          </span>
          <h3 className='min-w-0 flex-1 truncate text-subheadline font-semibold text-foreground'>{job.title}</h3>
          <span className='shrink-0 text-caption font-semibold text-muted-foreground'>{job.targetCodec}</span>
        </div>

        {/* Meta row: channel · source codec → target · size delta */}
        <p className='truncate text-footnote text-muted-foreground'>
          {job.channel} · {job.sourceCodec} {formatMB(job.sourceSizeMB)} → {job.targetCodec}{' '}
          {formatMB(job.targetSizeMB)}
        </p>

        {/* Progress */}
        {isActive ? (
          <div className='mt-1 flex items-center gap-2'>
            <div className='h-[3px] flex-1 overflow-hidden rounded-full bg-muted'>
              <div className='h-full rounded-full bg-primary transition-all' style={{ width: `${percent}%` }} />
            </div>
            <span className='shrink-0 text-caption tabular-nums text-muted-foreground'>{percent}%</span>
            {job.etaMinutes != null && (
              <span className='shrink-0 text-caption text-muted-foreground'>· {etaLabel(job.etaMinutes)}</span>
            )}
            {startedLabel && <span className='shrink-0 text-caption text-muted-foreground'>· {startedLabel}</span>}
          </div>
        ) : (
          <p className='text-footnote text-muted-foreground'>キュー位置 {job.queuePos} · 前のジョブ完了後に開始</p>
        )}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

function EncodePage() {
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<EncodeStatus>('encoding')
  // No API yet — show the dummy queue. Swap to real data once the
  // transcode worker lands in Phase 5.
  const isPending = false
  const isError = false
  const jobs = DUMMY_JOBS

  const activeCount = jobs.filter((j) => j.status === 'encoding').length
  const waitingCount = jobs.filter((j) => j.status === 'waiting').length
  const visibleJobs = jobs.filter((j) => j.status === filter)

  const tabs = [
    { value: 'encoding' as const, label: `エンコード中 ${activeCount}` },
    { value: 'waiting' as const, label: `待機 ${waitingCount}` }
  ]

  const header = (
    <PageHeader ariaLabel='エンコードヘッダー'>
      <div className='flex h-full w-[320px] max-w-full self-stretch'>
        <SegmentedFilter ariaLabel='エンコード状態' tabs={tabs} value={filter} onChange={setFilter} />
      </div>
    </PageHeader>
  )

  if (isPending) {
    return (
      <>
        {header}
        <div className='flex flex-col gap-1 p-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-[88px] w-full rounded' />
          ))}
        </div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {header}
        <div className='p-4'>
          <Alert variant='destructive'>
            <TriangleAlert />
            <AlertTitle>データの取得に失敗しました</AlertTitle>
            <AlertDescription>エンコードキューを読み込めませんでした。再度お試しください。</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className='flex-1 overflow-y-auto pb-16'>
        {visibleJobs.length === 0 ? (
          <div className='px-4 py-12'>
            <p className='text-footnote text-muted-foreground'>
              {filter === 'encoding' ? 'エンコード中のジョブはありません' : '待機中のジョブはありません'}
            </p>
          </div>
        ) : (
          <div className='mx-4 mt-4 overflow-hidden rounded-[4px] border border-border'>
            {visibleJobs.map((j) => (
              <EncodeRow key={j.id} job={j} />
            ))}
          </div>
        )}
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
