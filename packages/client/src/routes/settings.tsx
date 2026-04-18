import { createFileRoute } from '@tanstack/react-router'
import { HealthLogTail } from '@/components/settings/HealthLogTail'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Subsystem, useHealth } from '@/hooks/useHealth'
import { type ThemeChoice, useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  const GB = 1024 * 1024 * 1024
  const MB = 1024 * 1024
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(0)} MB`
  return `${bytes} B`
}

type SubStatus = 'ok' | 'warn' | 'err'

function statusVariant(s: SubStatus) {
  return s satisfies 'ok' | 'warn' | 'err'
}

// ─── Health strip ────────────────────────────────────────────────────────────

const SUBSYSTEMS: { key: Subsystem; label: string }[] = [
  { key: 'mirakc', label: 'mirakc' },
  { key: 'ffmpeg', label: 'ffmpeg' },
  { key: 'postgres', label: 'postgres' },
  { key: 'tuners', label: 'tuners' }
]

// ─── Section heading ─────────────────────────────────────────────────────────

function SectHead({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex items-center gap-2 pb-[7px] pt-[18px] font-mono text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground'>
      {children}
      <div className='h-px flex-1 bg-border' />
    </div>
  )
}

// ─── Diag row ────────────────────────────────────────────────────────────────

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
              <p className='font-mono text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-muted-foreground'>
                {name}
              </p>
              <p className='font-mono text-[0.6875rem] text-foreground'>{detail}</p>
              {sub && <p className='font-mono text-[0.5625rem] text-muted-foreground'>{sub}</p>}
              {extra}
            </div>
          </div>
        </div>
      </div>
      {logTail}
    </div>
  )
}

// ─── Status tab ──────────────────────────────────────────────────────────────

function StatusTab() {
  const { data, isError } = useHealth()

  if (isError || !data) {
    return (
      <div className='py-8 text-center font-mono text-[0.75rem] text-muted-foreground'>
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
      <SectHead>Streaming</SectHead>
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

      <SectHead>Storage</SectHead>
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
              <p className='mt-1 font-mono text-[0.5625rem] text-amber-500'>{diskPct}% used</p>
            )}
          </div>
        }
        logTail={null}
      />

      <SectHead>Runtime</SectHead>
      <DiagRow
        status={data.postgres.status}
        name='POSTGRES'
        detail={data.postgres.detail}
        logTail={<HealthLogTail subsystem='postgres' status={data.postgres.status} />}
      />
    </div>
  )
}

// ─── Theme segment control ────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'LIGHT' },
  { value: 'dark', label: 'DARK' },
  { value: 'system', label: 'AUTO' }
]

function ThemeSegment() {
  const { theme, setTheme } = useTheme()

  return (
    <fieldset
      aria-label='テーマ選択'
      className='inline-flex shrink-0 overflow-hidden rounded-[3px] border border-border bg-muted [border:none] [padding:0]'
    >
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type='button'
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
          className={cn(
            'border-r border-border px-3 py-[5px] font-sans text-[0.75rem] font-semibold last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            theme === opt.value
              ? 'bg-card font-bold text-foreground'
              : 'bg-transparent text-muted-foreground hover:bg-card/50'
          )}
        >
          {opt.label}
        </button>
      ))}
    </fieldset>
  )
}

// ─── Display tab ─────────────────────────────────────────────────────────────

function DisplayTab() {
  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead>テーマ</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <div className='flex items-center justify-between gap-4 px-3.5 py-3'>
          <div>
            <p className='text-[0.875rem] font-medium text-foreground'>テーマ</p>
            <p className='mt-0.5 text-[0.75rem] text-muted-foreground'>Light / Dark / システム設定に従う</p>
          </div>
          <ThemeSegment />
        </div>
      </div>

      <SectHead>画質</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card opacity-60'>
        <div className='flex items-center justify-between gap-4 px-3.5 py-3'>
          <div>
            <p className='text-[0.875rem] font-medium text-foreground'>画質プリセット</p>
            <p className='mt-0.5 text-[0.75rem] text-muted-foreground'>
              ライブ視聴時のデフォルト品質 (Phase 2 で実装予定)
            </p>
          </div>
          <fieldset
            aria-label='画質プリセット'
            disabled
            className='inline-flex shrink-0 cursor-not-allowed overflow-hidden rounded-[3px] border border-border bg-muted [border:1px_solid] [border-color:var(--border)] [padding:0]'
          >
            {['AUTO', 'HIGH', 'MED', 'LOW'].map((v) => (
              <span
                key={v}
                className='border-r border-border px-3 py-[5px] font-sans text-[0.75rem] font-semibold text-muted-foreground last:border-r-0'
              >
                {v}
              </span>
            ))}
          </fieldset>
        </div>
      </div>

      <p className='mt-3 font-sans text-[0.75rem] text-muted-foreground'>その他の設定は現フェーズ未実装です。</p>
    </div>
  )
}

// ─── About tab ────────────────────────────────────────────────────────────────

const ABOUT_ROWS = [
  { key: 'version', val: '0.1.0' },
  { key: 'commit', val: 'dev' },
  { key: 'built', val: '—' },
  { key: 'bun', val: typeof Bun !== 'undefined' ? Bun.version : '—' }
]

const LINK_ROWS = [
  { key: 'repo', val: 'GitHub', href: 'https://github.com' },
  { key: 'license', val: 'MIT License', href: '#' },
  { key: 'desc', val: 'KonomiTV clone — 外出先ライブ視聴', href: null }
]

function AboutTab() {
  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 max-[480px]:px-2.5'>
      <SectHead>Version</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        {ABOUT_ROWS.map(({ key, val }, i) => (
          <div key={key} className={cn('flex gap-0', i < ABOUT_ROWS.length - 1 && 'border-b border-border/60')}>
            <td className='w-[100px] shrink-0 px-3 py-1.5 font-mono text-[0.6875rem] font-semibold tracking-[0.03em] text-muted-foreground'>
              {key}
            </td>
            <td className='px-3 py-1.5 font-mono text-[0.6875rem] text-foreground'>
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

      <SectHead>Links</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        {LINK_ROWS.map(({ key, val, href }, i) => (
          <div key={key} className={cn('flex gap-0', i < LINK_ROWS.length - 1 && 'border-b border-border/60')}>
            <td className='w-[100px] shrink-0 px-3 py-1.5 font-mono text-[0.6875rem] font-semibold tracking-[0.03em] text-muted-foreground'>
              {key}
            </td>
            <td className='px-3 py-1.5 font-mono text-[0.6875rem]'>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const { data } = useHealth()

  const anyWarn = data
    ? [...SUBSYSTEMS.map((s) => data[s.key].status), data.disk.status].some((s) => s !== 'ok')
    : false

  return (
    <>
      <PageHeader ariaLabel='設定ヘッダー' className='items-center px-4'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>設定</h1>
      </PageHeader>

      {/* Pinned health strip */}
      <div
        role='status'
        aria-label='システム健全性'
        className={cn(
          'sticky top-page-header z-10 flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          anyWarn && 'border-b-amber-500/30 bg-amber-500/[0.04]'
        )}
      >
        {SUBSYSTEMS.map(({ key, label }) => {
          const sub = data?.[key]
          const st = sub?.status ?? 'ok'
          return (
            <div
              key={key}
              className='flex shrink-0 items-center gap-1.5 border-r border-border px-3.5 py-[5px] last:border-r-0'
            >
              <span className='font-mono text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground'>
                {label}
              </span>
              <StatusChip variant={st} size='sm'>
                {st.toUpperCase()}
              </StatusChip>
              {sub && (
                <span
                  className={cn('font-mono text-[0.5625rem] text-muted-foreground', st !== 'ok' && 'text-amber-500')}
                >
                  {sub.detail}
                </span>
              )}
            </div>
          )
        })}
        <div className='ml-auto flex shrink-0 items-center px-3.5'>
          <span className='font-mono text-[0.5625rem] text-muted-foreground/60'>更新 15s</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue='status' className='flex flex-1 flex-col'>
        <div className='sticky top-[calc(var(--page-header-h)+48px)] z-10 shrink-0 overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <TabsList className='h-auto w-full justify-start rounded-none bg-transparent p-0'>
            <TabsTrigger
              value='status'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              ステータス
            </TabsTrigger>
            <TabsTrigger
              value='display'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              表示設定
            </TabsTrigger>
            <TabsTrigger
              value='about'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              About
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='status' className='mt-0 flex-1'>
          <StatusTab />
        </TabsContent>
        <TabsContent value='display' className='mt-0 flex-1'>
          <DisplayTab />
        </TabsContent>
        <TabsContent value='about' className='mt-0 flex-1'>
          <AboutTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
