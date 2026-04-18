import { Row, SectHead, Segment } from '@/components/settings/_shared'
import { Switch } from '@/components/ui/switch'
import { type CodecChoice, type QualityChoice, usePlaybackPrefs } from '@/hooks/usePlaybackPrefs'
import { cn } from '@/lib/utils'

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

export function PlaybackTab() {
  const { prefs, update } = usePlaybackPrefs()

  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
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
        <dl className='divide-y divide-border/60 border-t border-border/60 bg-muted/20 px-3.5 py-2.5 text-[0.75rem]'>
          {QUALITY_OPTIONS.map((o) => (
            <div key={o.value} className='flex items-baseline gap-3 py-1'>
              <dt
                className={cn(
                  'w-[64px] shrink-0 font-sans text-[0.75rem] font-semibold',
                  prefs.quality === o.value ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {o.label}
              </dt>
              <dd className='w-[56px] shrink-0 font-sans tabular-nums text-[0.75rem] text-foreground'>
                {o.resolution}
              </dd>
              <dd className='min-w-0 text-[0.75rem] text-muted-foreground'>{o.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

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
                  'w-[90px] shrink-0 font-sans text-[0.75rem] font-semibold',
                  prefs.codec === o.value ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {o.label}
              </dt>
              <dd className='min-w-0 text-[0.75rem] text-muted-foreground'>{o.detail}</dd>
            </div>
          ))}
        </dl>
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

      <p className='mt-3 font-sans text-[0.75rem] text-muted-foreground'>
        ブラウザのローカルストレージに保存されます (端末ごと・アカウント同期なし)
      </p>
    </div>
  )
}
