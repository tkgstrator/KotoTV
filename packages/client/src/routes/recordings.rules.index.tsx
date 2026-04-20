import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shell/PageHeader'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useDeleteRecordingRule, useRecordingRules, useUpdateRecordingRule } from '@/hooks/useRecordingRules'
import { DOW_LABELS, minutesToHHMM } from '@/lib/recording-rules'
import { cn } from '@/lib/utils'
import type { RecordingRule } from '@/types/RecordingRule'

export const Route = createFileRoute('/recordings/rules/')({
  component: RecordingRulesPage
})

function EnabledToggle({ rule }: { rule: RecordingRule }) {
  const update = useUpdateRecordingRule()
  return (
    <Switch
      checked={rule.enabled}
      onCheckedChange={(v) => {
        update.mutate(
          { id: rule.id, data: { enabled: v } },
          { onError: (err) => toast.error(`更新失敗: ${err.message}`) }
        )
      }}
      aria-label={rule.enabled ? '無効にする' : '有効にする'}
      disabled={update.isPending}
    />
  )
}

function DeleteRuleButton({ rule }: { rule: RecordingRule }) {
  const { mutate, isPending } = useDeleteRecordingRule()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-9 text-destructive hover:bg-destructive/10 hover:text-destructive'
          disabled={isPending}
          aria-label='ルール削除'
        >
          <Trash2 className='size-4' />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ルールを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>「{rule.name}」を削除します。この操作は元に戻せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='text-footnote'>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive text-footnote text-destructive-foreground hover:bg-destructive/90'
            onClick={() => mutate(rule.id, { onSuccess: () => toast.success('ルールを削除しました') })}
          >
            削除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RuleRow({ rule }: { rule: RecordingRule }) {
  const navigate = useNavigate()

  const dowLabel = rule.dayOfWeek.length === 7 ? '毎日' : rule.dayOfWeek.map((d) => DOW_LABELS[d]).join('')

  const timeLabel =
    rule.timeStartMinutes != null && rule.timeEndMinutes != null
      ? `${minutesToHHMM(rule.timeStartMinutes)}〜${minutesToHHMM(rule.timeEndMinutes)}`
      : '終日'

  const keywordSummary = rule.keyword
    ? `${rule.keyword} (${rule.keywordMode === 'regex' ? '正規表現' : '部分一致'})`
    : '—'

  return (
    <div
      className={cn(
        'group items-center gap-3 border-b border-border bg-card px-4 py-2.5 transition-colors hover:bg-muted/40',
        // Mobile: toggle + name column + actions stack as a 3-col flex.
        // Desktop: share the exact grid template with the column header
        // below so every field lines up perfectly regardless of content.
        'flex',
        'sm:grid sm:grid-cols-[40px_minmax(0,1fr)_120px_140px_48px_88px]'
      )}
    >
      {/* enabled — stop propagation so toggle doesn't trigger row nav */}
      <div className='flex items-center'>
        <EnabledToggle rule={rule} />
      </div>

      {/* name + keyword — clickable area */}
      <button
        type='button'
        className='flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:flex-initial'
        onClick={() => navigate({ to: '/recordings/rules/$id', params: { id: rule.id } })}
        aria-label={`ルール「${rule.name}」を編集`}
      >
        <span className='truncate text-subheadline font-semibold text-foreground'>{rule.name}</span>
        <span className='truncate text-caption2 text-muted-foreground'>{keywordSummary}</span>
      </button>

      {/* channels */}
      <div className='hidden min-w-0 sm:block'>
        <span className='truncate tabular-nums text-caption text-muted-foreground'>
          {rule.channelIds.length === 0 ? '全チャンネル' : `${rule.channelIds.length} 局`}
        </span>
      </div>

      {/* day+time */}
      <div className='hidden min-w-0 flex-col gap-0.5 sm:flex'>
        <span className='truncate text-caption2 text-muted-foreground'>{dowLabel}</span>
        <span className='truncate text-caption2 text-muted-foreground'>{timeLabel}</span>
      </div>

      {/* priority */}
      <div className='hidden text-right sm:block'>
        <span className='tabular-nums text-caption text-muted-foreground'>{rule.priority}</span>
      </div>

      {/* actions */}
      <div className='flex items-center justify-end gap-1'>
        <Link to='/recordings/rules/$id' params={{ id: rule.id }}>
          <Button
            variant='ghost'
            size='icon'
            className='size-9 text-muted-foreground hover:text-foreground'
            aria-label='編集'
          >
            <Pencil className='size-4' />
          </Button>
        </Link>
        <DeleteRuleButton rule={rule} />
      </div>
    </div>
  )
}

// ─── Dummy data ─────────────────────────────────────────────────────────────
//
// Fallback rules while the backend endpoints are still being built
// (docs/plans/phase-4-recording-rules.md). Swap out when real data lands.

const DUMMY_RULES: RecordingRule[] = [
  {
    id: 'rule-1',
    name: 'NHK 総合 夜のニュース',
    enabled: true,
    keyword: 'ニュース',
    keywordMode: 'literal',
    keywordTarget: 'title',
    excludeKeyword: null,
    channelIds: ['gr-1024'],
    genres: ['ニュース/報道'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 19 * 60,
    timeEndMinutes: 22 * 60,
    priority: 10,
    avoidDuplicates: true,
    createdAt: '2026-04-10T09:00:00.000Z',
    updatedAt: '2026-04-15T09:00:00.000Z'
  },
  {
    id: 'rule-2',
    name: 'アニメ 自動録画',
    enabled: true,
    keyword: '.*',
    keywordMode: 'regex',
    keywordTarget: 'title',
    excludeKeyword: '再放送',
    channelIds: ['gr-1031', 'bs-211'],
    genres: ['アニメ/特撮'],
    dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeStartMinutes: null,
    timeEndMinutes: null,
    priority: 20,
    avoidDuplicates: true,
    createdAt: '2026-03-22T12:00:00.000Z',
    updatedAt: '2026-04-18T03:00:00.000Z'
  },
  {
    id: 'rule-3',
    name: 'ドキュメンタリー 自動録画',
    enabled: true,
    keyword: 'ガイアの夜明け|プロフェッショナル|クローズアップ現代',
    keywordMode: 'regex',
    keywordTarget: 'title_description',
    excludeKeyword: null,
    channelIds: [],
    genres: ['ドキュメンタリー/教養'],
    dayOfWeek: [1, 2, 3, 4, 5],
    timeStartMinutes: 20 * 60,
    timeEndMinutes: 24 * 60,
    priority: 30,
    avoidDuplicates: true,
    createdAt: '2026-02-14T08:00:00.000Z',
    updatedAt: '2026-04-01T08:00:00.000Z'
  },
  {
    id: 'rule-4',
    name: 'NHK BS 特集',
    enabled: false,
    keyword: '特集',
    keywordMode: 'literal',
    keywordTarget: 'title',
    excludeKeyword: null,
    channelIds: ['bs-101'],
    genres: [],
    dayOfWeek: [5, 6],
    timeStartMinutes: 21 * 60,
    timeEndMinutes: 24 * 60,
    priority: 40,
    avoidDuplicates: false,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-03-28T10:00:00.000Z'
  }
]

function RecordingRulesPage() {
  const { data, isPending, isError } = useRecordingRules()
  // Fall back to dummy rules so the screen isn't empty before the API
  // endpoints land. Once the backend returns a non-empty list this just
  // passes the real data through untouched.
  const realRules = data?.rules ?? []
  const rules = realRules.length > 0 ? realRules : DUMMY_RULES

  return (
    <>
      <PageHeader ariaLabel='録画ルールヘッダー' className='items-center gap-2 px-3'>
        <Link to='/recordings' className='text-caption text-muted-foreground hover:text-foreground'>
          録画
        </Link>
        <span className='text-caption text-border'>/</span>
        <h1 className='text-title3 font-bold leading-none'>録画ルール</h1>
        <div className='flex-1' />
        <Link to='/recordings/rules/new'>
          <Button size='sm' className='h-7 gap-1.5 px-3 text-footnote font-bold'>
            <Plus className='size-3.5' />
            新規ルール
          </Button>
        </Link>
      </PageHeader>

      {/* Column headers (desktop) — same grid template as RuleRow so the
          field positions always line up. */}
      <div className='hidden items-center gap-3 border-b border-border bg-muted/30 px-4 py-1.5 sm:grid sm:grid-cols-[40px_minmax(0,1fr)_120px_140px_48px_88px]'>
        <div />
        <div className='text-caption2 font-semibold text-muted-foreground'>名前 / キーワード</div>
        <div className='text-caption2 font-semibold text-muted-foreground'>対象</div>
        <div className='text-caption2 font-semibold text-muted-foreground'>スケジュール</div>
        <div className='text-right text-caption2 font-semibold text-muted-foreground'>優先度</div>
        <div />
      </div>

      {isPending && (
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-12 w-full rounded' />
          ))}
        </div>
      )}

      {isError && (
        <div className='px-4 py-12'>
          <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
            ルール一覧の取得に失敗しました
          </div>
        </div>
      )}

      {!isPending && !isError && rules.length === 0 && (
        <div className='px-4 py-16 text-center'>
          <p className='text-body text-muted-foreground'>まだ録画ルールがありません</p>
        </div>
      )}

      {!isPending && !isError && rules.length > 0 && (
        <section aria-label='録画ルール一覧' className='pb-16'>
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </section>
      )}
    </>
  )
}
