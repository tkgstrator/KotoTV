import { createFileRoute } from '@tanstack/react-router'
import { HealthLogTail } from '@/components/settings/HealthLogTail'
import { StatusChip } from '@/components/shared/status-chip'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useHealth } from '@/hooks/useHealth'
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

// ─── Section heading ─────────────────────────────────────────────────────────

/**
 * Uppercase label + divider line that matches the ステータス page rhythm.
 * `action` lets a tab drop its primary control (segment, switch…) into the
 * heading row instead of burying it in a bigger settings Row below — keeps
 * every card in the settings page feeling like the Status cards: compact
 * detail table in the card, chrome lives outside it.
 */
function SectHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className='flex items-center gap-3 pb-[7px] pt-[18px]'>
      <span className='shrink-0 font-sans text-footnote font-bold uppercase tracking-[0.12em] text-muted-foreground'>
        {children}
      </span>
      <div className='h-px flex-1 bg-border' />
      {action && <div className='shrink-0'>{action}</div>}
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
        'overflow-hidden rounded-[4px] border border-border bg-card',
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

// mirakc names tuners like "PLEX PX-MLT8PE #1" — the trailing "#N" is a
// per-device index, not part of the model. Strip it and pick the most
// common model since typical setups ship one physical card.
function primaryTunerModel(devices: { name: string; types: string[] }[]): string | null {
  if (devices.length === 0) return null
  const counts = new Map<string, { count: number; types: Set<string> }>()
  for (const d of devices) {
    const model = d.name.replace(/\s*#\d+\s*$/, '').trim() || d.name
    const entry = counts.get(model) ?? { count: 0, types: new Set() }
    entry.count += 1
    for (const t of d.types) entry.types.add(t)
    counts.set(model, entry)
  }
  // Highest count wins; ties keep insertion order so the first reported
  // model stays first.
  const [top] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)
  if (!top) return null
  const [model, { types }] = top
  return types.size > 0 ? `${model} · ${[...types].join('/')}` : model
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
  const tunerModel = primaryTunerModel(data.tuners.devices)

  return (
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
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
          detail={tunerModel ? `${tunerModel} · ${data.tuners.detail}` : data.tuners.detail}
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

const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'ブラウザのライトテーマを適用',
  dark: 'ブラウザのダークテーマを適用',
  system: 'OS のダーク設定に追従して自動切替'
}

function DisplayTab() {
  const { theme } = useTheme()
  return (
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead action={<ThemeSegment />}>テーマ</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <dl className='divide-y divide-border/60 px-3.5 py-1 text-footnote'>
          {THEME_OPTIONS.map((o) => (
            <div key={o.value} className='flex h-7 items-center gap-3'>
              <dt
                className={cn(
                  'w-[64px] shrink-0 font-semibold',
                  theme === o.value ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {o.label}
              </dt>
              <dd className='min-w-0 truncate text-muted-foreground'>{THEME_LABELS[o.value]}</dd>
            </div>
          ))}
        </dl>
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
  { value: 'avc', label: 'AVC', detail: '最も互換性が高い。全ての環境で再生可能だが、同画質だと帯域が大きめ' },
  { value: 'hevc', label: 'HEVC', detail: 'AVC より 30-50% 省帯域。iOS/macOS Safari と対応 GPU 環境で再生可' },
  { value: 'vp9', label: 'VP9', detail: 'オープン規格で HEVC 同等の圧縮率。Chrome / Firefox / Edge で広くサポート' }
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
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
      {/* Quality + codec share a row on wide screens — same grid gutter as
          Status so the settings page has a single visual rhythm. */}
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
        <div>
          <SectHead
            action={
              <Segment<QualityChoice>
                ariaLabel='画質プリセット'
                value={prefs.quality}
                options={QUALITY_OPTIONS}
                onChange={(v) => update({ quality: v })}
              />
            }
          >
            画質
          </SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            {/* Fixed h-7 per row so CJK glyphs in 可変 don't push the AUTO
                line taller than the ASCII-only rows below it. */}
            <dl className='divide-y divide-border/60 px-3.5 py-1 text-footnote'>
              {QUALITY_OPTIONS.map((o) => (
                <div key={o.value} className='flex h-7 items-center gap-3'>
                  <dt
                    className={cn(
                      'w-[64px] shrink-0 font-semibold',
                      prefs.quality === o.value ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {o.label}
                  </dt>
                  <dd className='w-[56px] shrink-0 tabular-nums text-foreground'>{o.resolution}</dd>
                  <dd className='min-w-0 truncate text-muted-foreground'>{o.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div>
          <SectHead
            action={
              <Segment<CodecChoice>
                ariaLabel='コーデック'
                value={prefs.codec}
                options={CODEC_OPTIONS}
                onChange={(v) => update({ codec: v })}
              />
            }
          >
            コーデック
          </SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            <dl className='divide-y divide-border/60 px-3.5 py-1 text-footnote'>
              {CODEC_OPTIONS.map((o) => (
                <div key={o.value} className='flex h-7 items-center gap-3'>
                  <dt
                    className={cn(
                      'w-[64px] shrink-0 font-semibold',
                      prefs.codec === o.value ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {o.label}
                  </dt>
                  <dd className='min-w-0 truncate text-muted-foreground'>{o.detail}</dd>
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

      <p className='mt-3 text-footnote text-muted-foreground'>
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
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
        <div>
          <SectHead>バージョン</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            <dl className='divide-y divide-border/60 px-3.5 py-1 text-footnote'>
              {ABOUT_ROWS.map(({ key, val }) => (
                <div key={key} className='flex h-7 items-center gap-3'>
                  <dt className='w-[100px] shrink-0 font-semibold text-muted-foreground'>{key}</dt>
                  <dd className='flex min-w-0 items-center gap-1.5 text-foreground'>
                    <span className='truncate'>{val}</span>
                    {key === 'version' && (
                      <StatusChip variant='info' size='sm'>
                        DEV
                      </StatusChip>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div>
          <SectHead>リンク</SectHead>
          <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
            <dl className='divide-y divide-border/60 px-3.5 py-1 text-footnote'>
              {LINK_ROWS.map(({ key, val, href }) => (
                <div key={key} className='flex h-7 items-center gap-3'>
                  <dt className='w-[100px] shrink-0 font-semibold text-muted-foreground'>{key}</dt>
                  <dd className='min-w-0 truncate'>
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
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  return (
    <Tabs defaultValue='status' className='flex flex-1 flex-col'>
      <div className='sticky top-0 z-10 shrink-0 overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
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
            情報
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
  )
}
