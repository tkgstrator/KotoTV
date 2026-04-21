import { createFileRoute } from '@tanstack/react-router'
import { format, toDate } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Pencil, Plus, Star, TimerReset, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { HealthLogTail } from '@/components/settings/HealthLogTail'
import { StatusChip } from '@/components/shared/status-chip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useBenchmarkEncodeProfile,
  useBenchmarkHistory,
  useCreateEncodeProfile,
  useDeleteEncodeProfile,
  useEncodeProfiles,
  useUpdateEncodeProfile
} from '@/hooks/useEncodeProfiles'
import { useHealth } from '@/hooks/useHealth'
import { type CodecChoice, type QualityChoice, usePlaybackPrefs } from '@/hooks/usePlaybackPrefs'
import { type ThemeChoice, useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import type {
  BenchmarkRequest,
  BenchmarkResponse,
  CreateEncodeProfile,
  EncodeMode,
  EncodeProfile,
  HwAccelType,
  RateControl,
  Resolution
} from '@/types/EncodeProfile'
import type { EncodeCodec, EncodeQuality, EncodeTiming } from '@/types/RecordingRule'

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
        <DiagRow status='ok' name='RUNTIME' detail={`${data.runtime.name} ${data.runtime.version}`} logTail={null} />
      </div>
    </div>
  )
}

// ─── Option picker (shared) ──────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'LIGHT' },
  { value: 'dark', label: 'DARK' },
  { value: 'system', label: 'AUTO' }
]

interface OptionPickerProps<T extends string> {
  ariaLabel: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}

/**
 * The card above already shows every option + its description as a
 * breakdown row; the picker only needs to surface which one is active
 * and let the user change it. A compact Select stays out of the way,
 * works at any viewport width, and avoids the alignment juggling a
 * horizontal segment bar required.
 */
function OptionPicker<T extends string>({ ariaLabel, value, options, onChange }: OptionPickerProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size='sm' aria-label={ariaLabel} className='w-[120px]'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align='end'>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ─── Display tab ─────────────────────────────────────────────────────────────

const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'ブラウザのライトテーマを適用',
  dark: 'ブラウザのダークテーマを適用',
  system: 'OS のダーク設定に追従して自動切替'
}

function DisplayTab() {
  const { theme, setTheme } = useTheme()
  return (
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
      {/* Single section today, but keep the 2-column grid so テーマ stays
          a half-width card on wide viewports instead of stretching edge
          to edge. Matches the Playback / About layout. */}
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
        <div>
          <SectHead
            action={
              <OptionPicker<ThemeChoice>
                ariaLabel='テーマ選択'
                value={theme}
                options={THEME_OPTIONS}
                onChange={setTheme}
              />
            }
          >
            テーマ
          </SectHead>
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
              <OptionPicker<QualityChoice>
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
              <OptionPicker<CodecChoice>
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

      {/* 再生動作 sits in the same 2-col rhythm so its card doesn't
          stretch across the full width on wide viewports. */}
      <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
        <div>
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
        </div>
      </div>

      <p className='mt-3 text-footnote text-muted-foreground'>
        ブラウザのローカルストレージに保存されます (端末ごと・アカウント同期なし)
      </p>
    </div>
  )
}

// ─── Encode tab ───────────────────────────────────────────────────────────────

const CODEC_VALUES: EncodeCodec[] = ['avc', 'hevc', 'vp9']
const QUALITY_LABELS: Record<EncodeQuality, string> = { high: '高', medium: '中', low: '低' }
const TIMING_LABELS: Record<EncodeTiming, string> = { immediate: '録画直後', idle: 'アイドル時' }
const HW_LABELS: Record<HwAccelType, string> = { cpu: 'なし', nvenc: 'NVEnc', vaapi: 'VAAPI' }
const RATE_LABELS: Record<RateControl, string> = { cbr: 'CBR', vbr: 'VBR', cqp: 'CQP' }
const RESOLUTION_LABELS: Record<Resolution, string> = { hd1080: '1080p', hd720: '720p', sd480: '480p' }

// Picking a simple-mode preset writes these concrete values into the advanced
// fields so the profile always persists the resolved rateControl / bitrate /
// qp, regardless of which mode the user edited in.
const QUALITY_PRESETS: Record<EncodeQuality, { rateControl: RateControl; bitrateKbps: number; qpValue: number }> = {
  high: { rateControl: 'vbr', bitrateKbps: 6000, qpValue: 20 },
  medium: { rateControl: 'vbr', bitrateKbps: 3000, qpValue: 23 },
  low: { rateControl: 'vbr', bitrateKbps: 1500, qpValue: 28 }
}

const TOGGLE_ON_CLS =
  'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground'

interface ProfileDraft {
  name: string
  mode: EncodeMode
  codec: EncodeCodec
  quality: EncodeQuality
  timing: EncodeTiming
  hwAccel: HwAccelType
  rateControl: RateControl
  bitrateKbps: number
  qpValue: number
  isDefault: boolean
  keepOriginalResolution: boolean
  resolution: Resolution
}

const EMPTY_DRAFT: ProfileDraft = {
  name: '',
  mode: 'simple',
  codec: 'avc',
  quality: 'medium',
  timing: 'immediate',
  hwAccel: 'cpu',
  rateControl: 'vbr',
  bitrateKbps: 4000,
  qpValue: 23,
  isDefault: false,
  keepOriginalResolution: true,
  resolution: 'hd720'
}

function toDraft(profile: EncodeProfile): ProfileDraft {
  return {
    name: profile.name,
    mode: profile.mode,
    codec: profile.codec,
    quality: profile.quality,
    timing: profile.timing,
    hwAccel: profile.hwAccel,
    rateControl: profile.rateControl,
    bitrateKbps: profile.bitrateKbps,
    qpValue: profile.qpValue,
    isDefault: profile.isDefault,
    keepOriginalResolution: profile.keepOriginalResolution,
    resolution: profile.resolution
  }
}

function toBenchmarkRequest(d: ProfileDraft, profileId?: string): BenchmarkRequest {
  return {
    codec: d.codec,
    quality: d.quality,
    timing: d.timing,
    hwAccel: d.hwAccel,
    mode: d.mode,
    rateControl: d.rateControl,
    bitrateKbps: d.bitrateKbps,
    qpValue: d.qpValue,
    keepOriginalResolution: d.keepOriginalResolution,
    resolution: d.resolution,
    ...(profileId !== undefined ? { profileId } : {})
  }
}

function ProfileDialog({
  open,
  onOpenChange,
  initial,
  title,
  submitLabel,
  onSubmit,
  isPending,
  existingProfileId
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: ProfileDraft
  title: string
  submitLabel: string
  onSubmit: (draft: CreateEncodeProfile) => void
  isPending: boolean
  existingProfileId?: string
}) {
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [pendingBenchResult, setPendingBenchResult] = useState<BenchmarkResponse | null>(null)
  const benchmark = useBenchmarkEncodeProfile()

  // Reset draft whenever the dialog is re-opened with a new initial value.
  useState(() => draft)

  function handleOpenChange(v: boolean) {
    if (v) {
      setDraft(initial)
      setPendingBenchResult(null)
    }
    onOpenChange(v)
  }

  async function handleSave() {
    try {
      const res = await benchmark.mutateAsync(toBenchmarkRequest(draft, existingProfileId))
      if (res.ok) {
        onSubmit(draft)
      } else {
        setPendingBenchResult(res)
      }
    } catch (err) {
      setPendingBenchResult({
        ok: false,
        fps: 0,
        wallSeconds: 0,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const buttonLabel = benchmark.isPending ? '検証中…' : isPending ? '保存中…' : submitLabel

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className='sm:max-w-[600px]'>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label className='text-footnote font-semibold text-muted-foreground'>プロファイル名</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder='例: HEVC 省容量'
                className='h-9 text-body'
                autoFocus
              />
            </div>
            <div className='grid grid-cols-2 items-start gap-4'>
              <div className='flex flex-col gap-1.5'>
                <Label className='text-footnote font-semibold text-muted-foreground'>コーデック</Label>
                <ToggleGroup
                  type='single'
                  variant='outline'
                  value={draft.codec}
                  onValueChange={(v) => v && setDraft((d) => ({ ...d, codec: v as EncodeCodec }))}
                  className='gap-1'
                >
                  {CODEC_VALUES.map((c) => (
                    <ToggleGroupItem key={c} value={c} className={cn('h-9 px-3 text-body uppercase', TOGGLE_ON_CLS)}>
                      {c}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className='flex flex-col gap-1.5'>
                <div className='flex items-center justify-between gap-2'>
                  <Label className='text-footnote font-semibold text-muted-foreground'>プリセット</Label>
                  <ToggleGroup
                    type='single'
                    variant='outline'
                    value={draft.mode}
                    onValueChange={(v) => v && setDraft((d) => ({ ...d, mode: v as EncodeMode }))}
                    className='gap-1'
                  >
                    <ToggleGroupItem value='simple' className={cn('h-8 px-3 text-footnote', TOGGLE_ON_CLS)}>
                      シンプル
                    </ToggleGroupItem>
                    <ToggleGroupItem value='advanced' className={cn('h-8 px-3 text-footnote', TOGGLE_ON_CLS)}>
                      詳細
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {draft.mode === 'simple' ? (
                  <ToggleGroup
                    type='single'
                    variant='outline'
                    value={draft.quality}
                    onValueChange={(v) => {
                      if (!v) return
                      const quality = v as EncodeQuality
                      const preset = QUALITY_PRESETS[quality]
                      setDraft((d) => ({ ...d, quality, ...preset }))
                    }}
                    className='gap-1'
                  >
                    {(['high', 'medium', 'low'] as const).map((q) => (
                      <ToggleGroupItem key={q} value={q} className={cn('h-9 px-3 text-body', TOGGLE_ON_CLS)}>
                        {QUALITY_LABELS[q]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <div className='flex flex-col gap-2.5 rounded-md border border-border bg-card/40 px-3 py-2.5'>
                    <div className='flex flex-col gap-1'>
                      <Label className='text-footnote font-semibold text-muted-foreground'>レートコントロール</Label>
                      <ToggleGroup
                        type='single'
                        variant='outline'
                        value={draft.rateControl}
                        onValueChange={(v) => v && setDraft((d) => ({ ...d, rateControl: v as RateControl }))}
                        className='gap-1'
                      >
                        {(['cbr', 'vbr', 'cqp'] as const).map((r) => (
                          <ToggleGroupItem
                            key={r}
                            value={r}
                            className={cn('h-9 px-3 text-body uppercase', TOGGLE_ON_CLS)}
                          >
                            {RATE_LABELS[r]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                    {draft.rateControl === 'cqp' ? (
                      <div className='flex flex-col gap-1'>
                        <Label className='text-footnote font-semibold text-muted-foreground'>QP 値</Label>
                        <div className='flex items-center gap-1.5'>
                          <Input
                            type='number'
                            min={0}
                            max={51}
                            value={draft.qpValue}
                            onChange={(e) => setDraft((d) => ({ ...d, qpValue: Number(e.target.value) }))}
                            className='h-9 w-24 tabular-nums text-body'
                          />
                          <span className='text-caption2 text-muted-foreground'>(0=最高〜51=最低)</span>
                        </div>
                      </div>
                    ) : (
                      <div className='flex flex-col gap-1'>
                        <Label className='text-footnote font-semibold text-muted-foreground'>ビットレート</Label>
                        <div className='flex items-center gap-1.5'>
                          <Input
                            type='number'
                            min={500}
                            max={80000}
                            step={100}
                            value={draft.bitrateKbps}
                            onChange={(e) => setDraft((d) => ({ ...d, bitrateKbps: Number(e.target.value) }))}
                            className='h-9 w-28 tabular-nums text-body'
                          />
                          <span className='text-footnote text-muted-foreground'>kbps</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className='flex flex-col gap-1.5'>
              <div className='flex items-center justify-between gap-2'>
                <Label className='text-footnote font-semibold text-muted-foreground'>解像度</Label>
                <div className='flex items-center gap-2'>
                  <span className='text-footnote text-muted-foreground'>オリジナルを維持</span>
                  <Switch
                    aria-label='オリジナルの解像度を維持'
                    checked={draft.keepOriginalResolution}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, keepOriginalResolution: v }))}
                  />
                </div>
              </div>
              {!draft.keepOriginalResolution && (
                <ToggleGroup
                  type='single'
                  variant='outline'
                  value={draft.resolution}
                  onValueChange={(v) => v && setDraft((d) => ({ ...d, resolution: v as Resolution }))}
                  className='gap-1'
                >
                  {(['hd1080', 'hd720', 'sd480'] as const).map((r) => (
                    <ToggleGroupItem key={r} value={r} className={cn('h-9 px-3 text-body', TOGGLE_ON_CLS)}>
                      {RESOLUTION_LABELS[r]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label className='text-footnote font-semibold text-muted-foreground'>タイミング</Label>
              <ToggleGroup
                type='single'
                variant='outline'
                value={draft.timing}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, timing: v as EncodeTiming }))}
                className='gap-1'
              >
                {(['immediate', 'idle'] as const).map((t) => (
                  <ToggleGroupItem key={t} value={t} className={cn('h-9 px-3 text-body', TOGGLE_ON_CLS)}>
                    {TIMING_LABELS[t]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label className='text-footnote font-semibold text-muted-foreground'>ハードウェア支援</Label>
              <ToggleGroup
                type='single'
                variant='outline'
                value={draft.hwAccel}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, hwAccel: v as HwAccelType }))}
                className='gap-1'
              >
                {(['cpu', 'nvenc', 'vaapi'] as const).map((h) => (
                  <ToggleGroupItem key={h} value={h} className={cn('h-9 px-3 text-body', TOGGLE_ON_CLS)}>
                    {HW_LABELS[h]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className='flex items-center justify-between gap-3'>
              <Label className='cursor-pointer text-body text-foreground'>このプロファイルを既定にする</Label>
              <Switch checked={draft.isDefault} onCheckedChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={benchmark.isPending || isPending || draft.name.trim().length === 0}>
              {buttonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingBenchResult !== null} onOpenChange={(v) => !v && setPendingBenchResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ベンチマークが基準を満たしませんでした</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='flex flex-col gap-1 text-body'>
                <span>
                  平均 {pendingBenchResult?.fps.toFixed(1)} fps / 処理時間 {pendingBenchResult?.wallSeconds.toFixed(1)}{' '}
                  秒
                </span>
                <span>リアルタイム再生 (29.97 fps) を下回っています。</span>
                <span>このまま保存すると、録画キューが詰まる可能性があります。</span>
                {pendingBenchResult?.reason && (
                  <pre className='mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-caption2 font-mono'>
                    {pendingBenchResult.reason}
                  </pre>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                onSubmit(draft)
                setPendingBenchResult(null)
              }}
            >
              このまま保存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EncodeTab() {
  const { data, isPending, isError } = useEncodeProfiles()
  const createMutation = useCreateEncodeProfile()
  const updateMutation = useUpdateEncodeProfile()
  const deleteMutation = useDeleteEncodeProfile()
  const benchmarkMutation = useBenchmarkEncodeProfile()
  const history = useBenchmarkHistory()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<EncodeProfile | null>(null)
  const [remeasuringId, setRemeasuringId] = useState<string | null>(null)

  const profiles = data?.profiles ?? []

  async function handleCreate(draft: CreateEncodeProfile) {
    try {
      await createMutation.mutateAsync(draft)
      toast.success('プロファイルを作成しました')
      setCreating(false)
    } catch (err) {
      toast.error(`作成失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  async function handleUpdate(id: string, draft: CreateEncodeProfile) {
    try {
      await updateMutation.mutateAsync({ id, data: draft })
      toast.success('プロファイルを更新しました')
      setEditing(null)
    } catch (err) {
      toast.error(`更新失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('プロファイルを削除しました')
    } catch (err) {
      toast.error(`削除失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  async function handleSetDefault(profile: EncodeProfile) {
    if (profile.isDefault) return
    try {
      await updateMutation.mutateAsync({ id: profile.id, data: { isDefault: true } })
      toast.success(`「${profile.name}」を既定にしました`)
    } catch (err) {
      toast.error(`更新失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  async function handleRemeasure(profile: EncodeProfile) {
    setRemeasuringId(profile.id)
    try {
      await benchmarkMutation.mutateAsync({
        codec: profile.codec,
        quality: profile.quality,
        timing: profile.timing,
        hwAccel: profile.hwAccel,
        mode: profile.mode,
        rateControl: profile.rateControl,
        bitrateKbps: profile.bitrateKbps,
        qpValue: profile.qpValue,
        keepOriginalResolution: profile.keepOriginalResolution,
        resolution: profile.resolution,
        profileId: profile.id
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        /busy/i.test(msg) ||
        (err instanceof Error && 'status' in err && (err as { status?: number }).status === 409)
      ) {
        toast.error('他のプロファイルを検証中です')
      } else {
        toast.error(msg)
      }
    } finally {
      setRemeasuringId(null)
    }
  }

  return (
    <div className='px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead
        action={
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button size='sm' className='h-8 gap-1.5 px-3 text-footnote'>
                <Plus className='size-4' />
                新規プロファイル
              </Button>
            </DialogTrigger>
            <ProfileDialog
              open={creating}
              onOpenChange={setCreating}
              initial={EMPTY_DRAFT}
              title='エンコードプロファイルを追加'
              submitLabel='作成'
              onSubmit={handleCreate}
              isPending={createMutation.isPending}
            />
          </Dialog>
        }
      >
        エンコードプロファイル
      </SectHead>
      <p className='mb-4 text-footnote text-muted-foreground'>
        録画ルール・手動予約から参照できる変換プロファイル。既定に指定した 1 件は新規ルール作成時の初期値になります。
      </p>

      {isError && (
        <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
          プロファイル一覧を取得できません
        </div>
      )}

      {!isError && !isPending && profiles.length === 0 && (
        <p className='py-8 text-center text-footnote text-muted-foreground'>
          プロファイルがまだありません。サーバー初回起動時に既定プロファイルが自動作成されるので、
          しばらく待ってから再読み込みしてください。
        </p>
      )}

      {profiles.length > 0 && (
        <div className='overflow-hidden rounded-[4px] border border-border'>
          {profiles.map((p) => (
            <div
              key={p.id}
              className='flex items-center gap-3 border-b border-border bg-card px-4 py-3 last:border-b-0'
            >
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <div className='flex items-baseline gap-2'>
                  <span className='truncate text-body font-semibold text-foreground'>{p.name}</span>
                  {p.isDefault && (
                    <StatusChip variant='info' size='sm'>
                      既定
                    </StatusChip>
                  )}
                </div>
                <div className='flex flex-wrap items-center gap-1.5 text-footnote text-muted-foreground'>
                  <span className='uppercase'>{p.codec}</span>
                  <span>·</span>
                  {p.mode === 'simple' ? (
                    <span>{QUALITY_LABELS[p.quality]}</span>
                  ) : p.rateControl === 'cqp' ? (
                    <span>CQP {p.qpValue}</span>
                  ) : (
                    <span>
                      {RATE_LABELS[p.rateControl]} {p.bitrateKbps}kbps
                    </span>
                  )}
                  <span>·</span>
                  <span>{TIMING_LABELS[p.timing]}</span>
                  <span>·</span>
                  <span>{HW_LABELS[p.hwAccel]}</span>
                </div>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='size-9 text-muted-foreground hover:text-foreground'
                onClick={() => handleRemeasure(p)}
                disabled={remeasuringId !== null}
                aria-label='このプロファイルで再測定'
              >
                <TimerReset className={cn('size-4', remeasuringId === p.id && 'animate-spin')} />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='size-9 text-muted-foreground hover:text-foreground'
                onClick={() => handleSetDefault(p)}
                disabled={p.isDefault || updateMutation.isPending}
                aria-label='既定にする'
              >
                <Star className={cn('size-4', p.isDefault && 'fill-primary text-primary')} />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='size-9 text-muted-foreground hover:text-foreground'
                onClick={() => setEditing(p)}
                aria-label='編集'
              >
                <Pencil className='size-4' />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-9 text-destructive hover:bg-destructive/10 hover:text-destructive'
                    disabled={deleteMutation.isPending}
                    aria-label='削除'
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>プロファイルを削除しますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      「{p.name}」を削除します。このプロファイルを参照していたルール・予約は
                      「エンコードしない」扱いに戻ります。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className='text-footnote'>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      variant='destructive'
                      className='text-footnote'
                      onClick={() => handleDelete(p.id)}
                    >
                      削除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProfileDialog
          open={editing !== null}
          onOpenChange={(v) => !v && setEditing(null)}
          initial={toDraft(editing)}
          title='エンコードプロファイルを編集'
          submitLabel='更新'
          onSubmit={(draft) => handleUpdate(editing.id, draft)}
          isPending={updateMutation.isPending}
          existingProfileId={editing.id}
        />
      )}

      <SectHead>ベンチマーク履歴</SectHead>
      <details className='rounded-[4px] border border-border bg-card'>
        <summary className='flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-body font-semibold'>
          <span>ベンチマーク履歴</span>
          <span className='text-footnote text-muted-foreground'>{history.data?.items.length ?? 0} 件</span>
        </summary>
        <div className='border-t border-border'>
          {history.isLoading ? (
            <p className='py-6 text-center text-footnote text-muted-foreground'>読み込み中…</p>
          ) : history.data?.items.length === 0 ? (
            <p className='py-6 text-center text-footnote text-muted-foreground'>
              まだベンチマーク履歴はありません — プロファイルを保存すると記録されます。
            </p>
          ) : (
            <div className='max-h-[400px] overflow-auto'>
              <table className='w-full text-footnote'>
                <thead>
                  <tr className='border-b border-border bg-muted/40 text-left text-caption2 font-semibold uppercase tracking-wider text-muted-foreground'>
                    <th className='w-[140px] px-3 py-2'>プロファイル</th>
                    <th className='px-3 py-2'>コーデック</th>
                    <th className='px-3 py-2'>HW支援</th>
                    <th className='px-3 py-2'>解像度</th>
                    <th className='px-3 py-2 tabular-nums'>fps</th>
                    <th className='px-3 py-2'>実行日</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data?.items.map((row) => (
                    <tr key={row.id} className='border-b border-border/50 last:border-b-0'>
                      <td className='w-[140px] px-3 py-2'>
                        {row.profileName ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className='block max-w-[140px] truncate text-foreground'>{row.profileName}</span>
                              </TooltipTrigger>
                              <TooltipContent side='right' className='max-w-[320px]'>
                                <p className='break-words text-caption2'>{row.profileName}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </td>
                      <td className='px-3 py-2 uppercase'>{row.codec}</td>
                      <td className='px-3 py-2'>{HW_LABELS[row.hwAccel]}</td>
                      {/* Benchmark always runs at 1080p regardless of the profile's target — pin the label. */}
                      <td className='px-3 py-2 text-muted-foreground'>1080p</td>
                      <td className={cn('px-3 py-2 tabular-nums', row.ok ? 'text-foreground' : 'text-destructive')}>
                        {row.ok || !row.reason ? (
                          <span>{row.fps.toFixed(1)}</span>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{row.fps.toFixed(1)}</span>
                              </TooltipTrigger>
                              <TooltipContent side='left' className='max-w-[320px]'>
                                <p className='break-words font-mono text-caption2'>{row.reason.slice(0, 500)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </td>
                      <td className='px-3 py-2 tabular-nums text-muted-foreground'>
                        {format(toDate(row.createdAt), 'MM/dd HH:mm', { locale: ja })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

// ─── About tab ────────────────────────────────────────────────────────────────

const ABOUT_ROWS = [
  { key: 'バージョン', val: '0.1.0' },
  { key: 'コミット', val: 'dev' },
  { key: 'ビルド日時', val: '—' }
]

const LINK_ROWS = [
  { key: 'リポジトリ', val: 'GitHub', href: 'https://github.com/tkgstrator/KotoTV' },
  { key: 'ライセンス', val: 'MIT License', href: 'https://github.com/tkgstrator/KotoTV/blob/master/LICENSE' },
  { key: '説明', val: 'KotoTV — 外出先ライブ視聴', href: null }
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
                    {key === 'バージョン' && (
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
      {/* Matches the SegmentedFilter on channels/EPG: 48px tall, no bar
          background, no bottom border, 480px cap so each tab matches the
          ~160px cell width used elsewhere. `variant="line"` swaps the
          pill-style active state for an underline via the trigger's
          ::after, which is what the channel/EPG filter uses visually. */}
      <div className='sticky top-0 z-10 flex h-page-header w-[600px] max-w-full shrink-0 bg-background'>
        <TabsList variant='line' className='h-full! w-full gap-0 p-0'>
          <TabsTrigger
            value='status'
            className='h-full rounded-none px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bottom-0'
          >
            ステータス
          </TabsTrigger>
          <TabsTrigger
            value='playback'
            className='h-full rounded-none px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bottom-0'
          >
            再生
          </TabsTrigger>
          <TabsTrigger
            value='encode'
            className='h-full rounded-none px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bottom-0'
          >
            エンコード
          </TabsTrigger>
          <TabsTrigger
            value='display'
            className='h-full rounded-none px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bottom-0'
          >
            表示設定
          </TabsTrigger>
          <TabsTrigger
            value='about'
            className='h-full rounded-none px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bottom-0'
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
      <TabsContent value='encode' className='mt-0 flex-1'>
        <EncodeTab />
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
