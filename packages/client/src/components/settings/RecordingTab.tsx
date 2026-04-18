import { Row, SEGMENT_ITEM_CLASS, SectHead } from '@/components/settings/_shared'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CodecChoice } from '@/hooks/usePlaybackPrefs'
import { useRecordingPrefs } from '@/hooks/useRecordingPrefs'
import { cn } from '@/lib/utils'

const RECORDING_CODEC_OPTIONS: { value: CodecChoice; label: string; detail: string }[] = [
  { value: 'auto', label: 'AUTO', detail: 'ライブ視聴の優先コーデックに合わせる' },
  { value: 'avc', label: 'AVC (H.264)', detail: '互換性最優先。全端末で再生可能だがファイル大' },
  { value: 'hevc', label: 'HEVC (H.265)', detail: 'AVC より 30-50% 省サイズ。iOS / 最新端末で再生可' },
  { value: 'vp9', label: 'VP9', detail: 'オープン規格。Chrome/Firefox/Edge 向け' }
]

export function RecordingTab() {
  const { prefs, update } = useRecordingPrefs()

  return (
    <div className='mx-auto max-w-[720px] px-5 pb-10 font-sans max-[480px]:px-2.5'>
      <SectHead>変換</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <Row title='デフォルト出力コーデック' sub='録画完了後の変換で使う既定コーデック'>
          <ToggleGroup
            type='single'
            value={prefs.defaultCodec}
            onValueChange={(v) => v && update({ defaultCodec: v as CodecChoice })}
            aria-label='デフォルト出力コーデック'
            size='sm'
            className='shrink-0'
          >
            {RECORDING_CODEC_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value} className={SEGMENT_ITEM_CLASS}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        <dl className='divide-y divide-border/60 border-t border-border/60 bg-muted/20 px-3.5 py-2.5'>
          {RECORDING_CODEC_OPTIONS.map((o) => (
            <div key={o.value} className='flex items-baseline gap-3 py-1.5'>
              <dt
                className={cn(
                  'w-[90px] shrink-0 font-sans text-[0.75rem] font-semibold',
                  prefs.defaultCodec === o.value ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {o.label}
              </dt>
              <dd className='min-w-0 text-[0.75rem] text-muted-foreground'>{o.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      <SectHead>ルール既定値</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <Row title='デフォルト優先度' sub={`新規ルール作成時の初期値 (${prefs.defaultPriority} / 100)`}>
          <input
            type='range'
            min={1}
            max={100}
            step={1}
            value={prefs.defaultPriority}
            onChange={(e) => update({ defaultPriority: Number(e.target.value) })}
            aria-label='デフォルト優先度'
            className='h-[22px] w-[160px] accent-primary'
          />
        </Row>
        <Row title='再放送スキップをデフォルトで有効' sub='新規ルールの「重複回避」スイッチの初期状態'>
          <Switch
            checked={prefs.avoidDuplicatesDefault}
            onCheckedChange={(v) => update({ avoidDuplicatesDefault: v })}
            aria-label='再放送スキップをデフォルトで有効'
          />
        </Row>
      </div>

      <SectHead>ストレージ</SectHead>
      <div className='overflow-hidden rounded-[4px] border border-border bg-card'>
        <Row title='変換後も .ts を保持' sub='オフなら変換完了時に .ts を削除してディスクを節約'>
          <Switch
            checked={prefs.keepTsAfterConvert}
            onCheckedChange={(v) => update({ keepTsAfterConvert: v })}
            aria-label='変換後も .ts を保持'
          />
        </Row>
        <Row title='ディスク警告閾値' sub={`${prefs.diskWarnPct}% を超えるとステータスタブが WARN 表示になる`}>
          <input
            type='range'
            min={50}
            max={99}
            step={1}
            value={prefs.diskWarnPct}
            onChange={(e) => update({ diskWarnPct: Number(e.target.value) })}
            aria-label='ディスク警告閾値'
            className='h-[22px] w-[160px] accent-primary'
          />
        </Row>
      </div>

      <p className='mt-3 font-sans text-[0.75rem] text-muted-foreground'>
        ブラウザのローカルストレージに保存されます (端末ごと・アカウント同期なし)
      </p>
    </div>
  )
}
