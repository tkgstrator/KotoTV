import { createFileRoute } from '@tanstack/react-router'
import { HealthLogTail } from '@/components/settings/HealthLogTail'
import { StatusChip } from '@/components/shared/status-chip'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type Subsystem, useHealth } from '@/hooks/useHealth'
import { type CodecChoice, type QualityChoice, usePlaybackPrefs } from '@/hooks/usePlaybackPrefs'
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
    <div className='flex items-center gap-2 pb-[7px] pt-[18px] font-sans text-footnote font-bold uppercase tracking-[0.12em] text-muted-foreground'>
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
              <p className='font-sans text-footnote font-bold uppercase tracking-[0.04em] text-muted-foreground'>
                {name}
              </p>
              <p className='font-sans text-subheadline text-foreground'>{detail}</p>
              {sub && <p className='font-sans text-footnote text-muted-foreground'>{sub}</p>}
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
      <div className='py-8 text-center font-sans text-body text-muted-foreground'>ヘルスデータを取得できません</div>
    )
  }

  const diskPct =
    data.disk.breakdown.total > 0
      ? Math.round(((data.disk.breakdown.total - data.disk.breakdown.free) / data.disk.breakdown.total) * 100)
      : 0

  return (
    <div className='mx-auto max-w-[1200px] px-5 pb-10 max-[480px]:px-2.5'>
      <SectHead>Streaming</SectHead>
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2 xl:grid-cols-3'>
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

      <SectHead>System</SectHead>
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
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
                <p className='mt-1 font-sans text-footnote tabular-nums text-amber-500'>{diskPct}% used</p>
              )}
            </div>
          }
          logTail={null}
        />
        <DiagRow
          status={data.postgres.status}
          name='POSTGRES'
          detail={data.postgres.detail}
          logTail={<HealthLogTail subsystem='postgres' status={data.postgres.status} />}
        />
      </div>
    </div>
  )
}

// ─── Theme segment control ────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'LIGHT' },
  { value: 'dark', label: 'DARK' },
  { value: 'system', label: 'AUTO' }
]

const SEGMENT_ITEM_CLASS =
  'bg-muted text-muted-foreground hover:bg-background/60 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:font-semibold data-[state=on]:hover:bg-primary'

function ThemeSegment() {
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type='single'
      value={theme}
      onValueChange={(v) => v && setTheme(v as ThemeChoice)}
      aria-label='テーマ選択'
      size='sm'
      className='shrink-0'
    >
      {THEME_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className={SEGMENT_ITEM_CLASS}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// ─── Display tab ─────────────────────────────────────────────────────────────

function DisplayTab() {
  return (
    <div className='mx-auto max-w-[1200px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead>テーマ</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card lg:max-w-[600px]'>
        <div className='flex items-center justify-between gap-4 px-3.5 py-3'>
          <div>
            <p className='text-body font-medium text-foreground'>テーマ</p>
            <p className='mt-0.5 text-footnote text-muted-foreground'>Light / Dark / システム設定に従う</p>
          </div>
          <ThemeSegment />
        </div>
      </div>
    </div>
  )
}

// ─── Playback tab ────────────────────────────────────────────────────────────

const QUALITY_OPTIONS: { value: QualityChoice; label: string; resolution: string; detail: string }[] = [
  { value: 'auto', label: 'AUTO', resolution: '可変', detail: '帯域と端末性能に応じて自動切替' },
  { value: 'high', label: 'HIGH', resolution: '1080p', detail: '地デジ相当の高画質。Wi-Fi 推奨' },
  { value: 'medium', label: 'MED', resolution: '720p', detail: '画質と帯域のバランス型。LTE でも可' },
  { value: 'low', label: 'LOW', resolution: '480p', detail: '省帯域。弱電波・モバイル回線向け' }
]

const CODEC_OPTIONS: { value: CodecChoice; label: string; detail: string }[] = [
  { value: 'auto', label: 'AUTO', detail: 'ブラウザが対応する中で最適なコーデックを自動選択' },
  {
    value: 'avc',
    label: 'AVC (H.264)',
    detail: '最も互換性が高い。全ての環境で再生可能だが、同画質だと帯域が大きめ'
  },
  {
    value: 'hevc',
    label: 'HEVC (H.265)',
    detail: 'AVC より 30-50% 省帯域。iOS/macOS Safari と対応 GPU 環境で再生可'
  },
  {
    value: 'vp9',
    label: 'VP9',
    detail: 'オープン規格で HEVC 同等の圧縮率。Chrome / Firefox / Edge で広くサポート'
  }
]

interface SegmentProps<T extends string> {
  ariaLabel: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}

function Segment<T extends string>({ ariaLabel, value, options, onChange }: SegmentProps<T>) {
  return (
    <ToggleGroup
      type='single'
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={ariaLabel}
      size='sm'
      className='shrink-0'
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className={SEGMENT_ITEM_CLASS}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-4 border-b border-border/60 px-3.5 py-3 last:border-b-0'>
      <div className='min-w-0'>
        <p className='text-body font-medium text-foreground'>{title}</p>
        {sub && <p className='mt-0.5 text-footnote text-muted-foreground'>{sub}</p>}
      </div>
      <div className='shrink-0'>{children}</div>
    </div>
  )
}

function PlaybackTab() {
  const { prefs, update } = usePlaybackPrefs()

  return (
    <div className='mx-auto max-w-[1200px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
      {/* Quality + codec share a row on wide screens — their cards are
          similarly shaped (segment + detail table) and naturally pair. */}
      <div className='grid grid-cols-1 items-start gap-x-6 lg:grid-cols-2'>
        <div>
          <SectHead>画質</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            <Row title='デフォルト画質' sub='画質は解像度の上限を切替えます。ビットレートは各解像度に応じて自動決定'>
              <Segment<QualityChoice>
                ariaLabel='画質プリセット'
                value={prefs.quality}
                options={QUALITY_OPTIONS}
                onChange={(v) => update({ quality: v })}
              />
            </Row>
            <dl className='divide-y divide-border/60 border-t border-border/60 bg-muted/20 px-3.5 py-2.5 text-footnote'>
              {QUALITY_OPTIONS.map((o) => (
                <div key={o.value} className='flex items-baseline gap-3 py-1'>
                  <dt
                    className={cn(
                      'w-[64px] shrink-0 font-sans text-footnote font-semibold',
                      prefs.quality === o.value ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {o.label}
                  </dt>
                  <dd className='w-[56px] shrink-0 font-sans tabular-nums text-footnote text-foreground'>
                    {o.resolution}
                  </dd>
                  <dd className='min-w-0 text-footnote text-muted-foreground'>{o.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div>
          <SectHead>コーデック</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            <Row title='優先コーデック' sub='未対応環境では自動的に AVC へフォールバック'>
              <Segment<CodecChoice>
                ariaLabel='コーデック'
                value={prefs.codec}
                options={CODEC_OPTIONS}
                onChange={(v) => update({ codec: v })}
              />
            </Row>
            <dl className='divide-y divide-border/60 border-t border-border/60 bg-muted/20 px-3.5 py-2.5'>
              {CODEC_OPTIONS.map((o) => (
                <div key={o.value} className='flex items-baseline gap-3 py-1.5'>
                  <dt
                    className={cn(
                      'w-[90px] shrink-0 font-sans text-footnote font-semibold',
                      prefs.codec === o.value ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {o.label}
                  </dt>
                  <dd className='min-w-0 text-footnote text-muted-foreground'>{o.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <SectHead>再生動作</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <Row title='自動再生' sub='チャンネル/録画を開いた直後に再生を開始'>
          <Switch checked={prefs.autoplay} onCheckedChange={(v) => update({ autoplay: v })} aria-label='自動再生' />
        </Row>
        <Row title='低遅延モード' sub='ライブ時にバッファを最小化 (帯域不安定だとカクつく可能性)'>
          <Switch
            checked={prefs.lowLatency}
            onCheckedChange={(v) => update({ lowLatency: v })}
            aria-label='低遅延モード'
          />
        </Row>
        <Row title='デフォルト音量' sub={`${Math.round(prefs.defaultVolume * 100)}%`}>
          <input
            type='range'
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.defaultVolume * 100)}
            onChange={(e) => update({ defaultVolume: Number(e.target.value) / 100 })}
            aria-label='デフォルト音量'
            className='h-[22px] w-[140px] accent-primary'
          />
        </Row>
      </div>

      <p className='mt-3 font-sans text-footnote text-muted-foreground'>
        ブラウザのローカルストレージに保存されます (端末ごと・アカウント同期なし)
      </p>
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
    <div className='mx-auto max-w-[1200px] px-5 pb-10 max-[480px]:px-2.5'>
      <div className='grid grid-cols-1 items-start gap-x-6 lg:grid-cols-2'>
        <div>
          <SectHead>Version</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            {ABOUT_ROWS.map(({ key, val }, i) => (
              <div key={key} className={cn('flex gap-0', i < ABOUT_ROWS.length - 1 && 'border-b border-border/60')}>
                <div className='w-[100px] shrink-0 px-3 py-1.5 font-sans text-footnote font-semibold text-muted-foreground'>
                  {key}
                </div>
                <div className='px-3 py-1.5 font-sans text-footnote text-foreground'>
                  {val}
                  {key === 'version' && (
                    <StatusChip variant='info' size='sm' className='ml-1.5'>
                      DEV
                    </StatusChip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectHead>Links</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            {LINK_ROWS.map(({ key, val, href }, i) => (
              <div key={key} className={cn('flex gap-0', i < LINK_ROWS.length - 1 && 'border-b border-border/60')}>
                <div className='w-[100px] shrink-0 px-3 py-1.5 font-sans text-footnote font-semibold text-muted-foreground'>
                  {key}
                </div>
                <div className='px-3 py-1.5 font-sans text-footnote'>
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
                </div>
              </div>
            ))}
          </div>
        </div>
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
      {/* Pinned health strip */}
      <div
        role='status'
        aria-label='システム健全性'
        className={cn(
          'sticky top-0 z-10 flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
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
              <span className='font-mono text-caption font-bold uppercase tracking-[0.08em] text-muted-foreground'>
                {label}
              </span>
              <StatusChip variant={st} size='sm'>
                {st.toUpperCase()}
              </StatusChip>
              {sub && (
                <span className={cn('font-mono text-caption text-muted-foreground', st !== 'ok' && 'text-amber-500')}>
                  {sub.detail}
                </span>
              )}
            </div>
          )
        })}
        <div className='ml-auto flex shrink-0 items-center px-3.5'>
          <span className='font-mono text-caption text-muted-foreground/60'>更新 15s</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue='status' className='flex flex-1 flex-col'>
        <div className='sticky top-[48px] z-10 shrink-0 overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <TabsList className='h-auto w-full justify-start rounded-none bg-transparent p-0'>
            <TabsTrigger
              value='status'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-footnote font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              ステータス
            </TabsTrigger>
            <TabsTrigger
              value='playback'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-footnote font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              再生
            </TabsTrigger>
            <TabsTrigger
              value='display'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-footnote font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              表示設定
            </TabsTrigger>
            <TabsTrigger
              value='about'
              className='rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-footnote font-bold uppercase tracking-[0.06em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none'
            >
              About
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='status' className='mt-0 flex-1'>
          <StatusTab />
        </TabsContent>
        <TabsContent value='playback' className='mt-0 flex-1'>
          <PlaybackTab />
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
