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
import type { RecordingRule } from '@/types/RecordingRule'

export const Route = createFileRoute('/recordings/rules')({
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
          size='sm'
          className='h-7 gap-1 px-2 font-mono text-[0.6875rem] font-bold text-destructive hover:bg-destructive/10 hover:text-destructive'
          disabled={isPending}
          aria-label='ルール削除'
        >
          <Trash2 className='size-3' />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className='font-mono'>ルールを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>「{rule.name}」を削除します。この操作は元に戻せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='font-mono text-[0.75rem]'>CANCEL</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive font-mono text-[0.75rem] text-destructive-foreground hover:bg-destructive/90'
            onClick={() => mutate(rule.id, { onSuccess: () => toast.success('ルールを削除しました') })}
          >
            DELETE
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

  const keywordSummary = rule.keyword ? `${rule.keyword} [${rule.keywordMode === 'regex' ? 'RE' : 'LIT'}]` : '—'

  return (
    <div className='group flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 transition-colors hover:bg-muted/40'>
      {/* enabled — stop propagation so toggle doesn't trigger row nav */}
      <div className='flex shrink-0 items-center'>
        <EnabledToggle rule={rule} />
      </div>

      {/* name + keyword — clickable area */}
      <button
        type='button'
        className='flex min-w-0 flex-1 flex-col gap-0.5 text-left'
        onClick={() => navigate({ to: '/recordings/rules/$id', params: { id: rule.id } })}
        aria-label={`ルール「${rule.name}」を編集`}
      >
        <span className='truncate font-mono text-[0.8125rem] font-semibold text-foreground'>{rule.name}</span>
        <span className='truncate font-mono text-[0.625rem] text-muted-foreground'>{keywordSummary}</span>
      </button>

      {/* channels */}
      <div className='hidden w-16 shrink-0 sm:block'>
        <span className='font-mono tabular-nums text-[0.6875rem] text-muted-foreground'>
          {rule.channelIds.length === 0 ? 'ALL' : `${rule.channelIds.length} CH`}
        </span>
      </div>

      {/* day+time */}
      <div className='hidden w-28 shrink-0 flex-col gap-0.5 sm:flex'>
        <span className='font-mono text-[0.625rem] text-muted-foreground'>{dowLabel}</span>
        <span className='font-mono text-[0.625rem] text-muted-foreground'>{timeLabel}</span>
      </div>

      {/* priority */}
      <div className='hidden w-10 shrink-0 text-right sm:block'>
        <span className='font-mono tabular-nums text-[0.6875rem] text-muted-foreground'>{rule.priority}</span>
      </div>

      {/* actions */}
      <div className='flex shrink-0 items-center gap-1'>
        <Link to='/recordings/rules/$id' params={{ id: rule.id }}>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 px-2 font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground'
            aria-label='編集'
          >
            <Pencil className='size-3' />
          </Button>
        </Link>
        <DeleteRuleButton rule={rule} />
      </div>
    </div>
  )
}

function RecordingRulesPage() {
  const { data, isPending, isError } = useRecordingRules()
  const rules = data?.rules ?? []

  return (
    <>
      <PageHeader ariaLabel='録画ルールヘッダー' className='items-center gap-2 px-3'>
        <Link to='/recordings' className='font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground'>
          録画
        </Link>
        <span className='font-mono text-[0.6875rem] text-border'>/</span>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>録画ルール</h1>
        <div className='flex-1' />
        <Link to='/recordings/rules/new'>
          <Button size='sm' className='h-7 gap-1.5 px-3 font-mono text-[0.75rem] font-bold'>
            <Plus className='size-3.5' />+ 新規ルール
          </Button>
        </Link>
      </PageHeader>

      {/* Column headers (desktop) */}
      <div className='hidden items-center gap-3 border-b border-border bg-muted/30 px-4 py-1.5 sm:flex'>
        <div className='w-9 shrink-0' />
        <div className='flex-1 font-mono text-[0.5rem] font-bold uppercase tracking-wider text-muted-foreground'>
          NAME / KEYWORD
        </div>
        <div className='w-16 shrink-0 font-mono text-[0.5rem] font-bold uppercase tracking-wider text-muted-foreground'>
          CHANNELS
        </div>
        <div className='w-28 shrink-0 font-mono text-[0.5rem] font-bold uppercase tracking-wider text-muted-foreground'>
          SCHEDULE
        </div>
        <div className='w-10 shrink-0 text-right font-mono text-[0.5rem] font-bold uppercase tracking-wider text-muted-foreground'>
          PRI
        </div>
        <div className='w-16 shrink-0' />
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
          <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 font-mono text-[0.75rem] text-destructive'>
            ERR ルール一覧の取得に失敗しました
          </div>
        </div>
      )}

      {!isPending && !isError && rules.length === 0 && (
        <div className='px-4 py-16'>
          <p className='mb-3 font-mono text-[0.8125rem] font-semibold text-muted-foreground'>
            $ no rules yet — tap + to create
          </p>
          <Link to='/recordings/rules/new'>
            <Button variant='outline' size='sm' className='font-mono text-[0.75rem]'>
              + 最初のルールを作成
            </Button>
          </Link>
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
