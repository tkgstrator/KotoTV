import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { useNavigate } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ChannelPicker } from '@/components/recording/ChannelPicker'
import { RulePreviewPane } from '@/components/recording/RulePreviewPane'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  useCreateRecordingRule,
  useDeleteRecordingRule,
  useRecordingRulePreview,
  useUpdateRecordingRule
} from '@/hooks/useRecordingRules'
import {
  ARIB_GENRES,
  DOW_LABELS,
  HHMMToMinutes,
  matchingPreset,
  minutesToHHMM,
  TIME_PRESETS
} from '@/lib/recording-rules'
import { cn } from '@/lib/utils'
import type { CreateRecordingRule, RecordingRule } from '@/types/RecordingRule'

function regexError(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    new RegExp(value)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'invalid regex'
  }
}

interface RuleFormProps {
  channels: Channel[]
  existing?: RecordingRule
}

const DEFAULT_VALUES: CreateRecordingRule = {
  name: '',
  enabled: true,
  keyword: '',
  keywordMode: 'literal',
  keywordTarget: 'title',
  excludeKeyword: '',
  channelIds: [],
  genres: [],
  dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
  timeStartMinutes: null,
  timeEndMinutes: null,
  priority: 50,
  avoidDuplicates: true
}

function toCreateRule(existing: RecordingRule): CreateRecordingRule {
  return {
    name: existing.name,
    enabled: existing.enabled,
    keyword: existing.keyword ?? '',
    keywordMode: existing.keywordMode,
    keywordTarget: existing.keywordTarget,
    excludeKeyword: existing.excludeKeyword ?? '',
    channelIds: existing.channelIds,
    genres: existing.genres,
    dayOfWeek: existing.dayOfWeek,
    timeStartMinutes: existing.timeStartMinutes ?? null,
    timeEndMinutes: existing.timeEndMinutes ?? null,
    priority: existing.priority,
    avoidDuplicates: existing.avoidDuplicates
  }
}

export function RuleForm({ channels, existing }: RuleFormProps) {
  const navigate = useNavigate()
  const createMutation = useCreateRecordingRule()
  const updateMutation = useUpdateRecordingRule()
  const deleteMutation = useDeleteRecordingRule()

  const { register, watch, setValue, handleSubmit, reset } = useForm<CreateRecordingRule>({
    defaultValues: existing ? toCreateRule(existing) : DEFAULT_VALUES
  })

  useEffect(() => {
    if (existing) reset(toCreateRule(existing))
  }, [existing, reset])

  const watched = watch()

  const previewRule = useMemo((): CreateRecordingRule | null => {
    if (!watched.keyword && watched.channelIds.length === 0) return null
    return watched
  }, [watched])

  async function onSubmit(data: CreateRecordingRule) {
    if (data.keywordMode === 'regex') {
      const kErr = regexError(data.keyword)
      const eErr = regexError(data.excludeKeyword)
      if (kErr || eErr) {
        toast.error(`正規表現が不正: ${kErr ?? eErr}`)
        return
      }
    }
    const cleaned: CreateRecordingRule = {
      ...data,
      keyword: data.keyword || null,
      excludeKeyword: data.excludeKeyword || null
    }
    try {
      if (existing) {
        await updateMutation.mutateAsync({ id: existing.id, data: cleaned })
        toast.success('ルールを更新しました')
      } else {
        await createMutation.mutateAsync(cleaned)
        toast.success('ルールを作成しました')
      }
      navigate({ to: '/recordings/rules' })
    } catch (err) {
      toast.error(`保存失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  async function onDelete() {
    if (!existing) return
    try {
      await deleteMutation.mutateAsync(existing.id)
      toast.success('ルールを削除しました')
      navigate({ to: '/recordings/rules' })
    } catch (err) {
      toast.error(`削除失敗: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  const channelIds = watch('channelIds')
  const genres = watch('genres')
  const dayOfWeek = watch('dayOfWeek')
  const timeStart = watch('timeStartMinutes')
  const timeEnd = watch('timeEndMinutes')
  const avoidDuplicates = watch('avoidDuplicates')
  const keywordMode = watch('keywordMode')
  const keywordTarget = watch('keywordTarget')
  const keyword = watch('keyword')
  const excludeKeyword = watch('excludeKeyword')

  const keywordRegexError = useMemo(
    () => (keywordMode === 'regex' ? regexError(keyword) : null),
    [keywordMode, keyword]
  )
  const excludeKeywordRegexError = useMemo(
    () => (keywordMode === 'regex' ? regexError(excludeKeyword) : null),
    [keywordMode, excludeKeyword]
  )

  const { data: previewData, isPending: isPreviewPending } = useRecordingRulePreview(previewRule)

  const activePreset = matchingPreset(timeStart, timeEnd)

  const hasRegexError = Boolean(keywordRegexError || excludeKeywordRegexError)
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className='flex h-full w-full flex-col overflow-hidden lg:grid lg:grid-cols-[55%_45%]'>
      {/* Form pane */}
      <div className='flex-1 overflow-y-auto border-b border-border lg:min-w-0 lg:border-b-0 lg:border-r'>
        <form onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-5 p-4'>
          {/* ── 1. ルール名 */}
          <div className='flex flex-col gap-1.5'>
            <Label className='text-footnote font-semibold text-muted-foreground'>ルール名</Label>
            <Input
              {...register('name', { required: true })}
              className='h-9 text-body'
              placeholder='例: NHKスペシャル'
              autoFocus
            />
          </div>

          {/* ── 3. キーワード */}
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <Label className='text-footnote font-semibold text-muted-foreground'>キーワード</Label>
              <span className={cn('tabular-nums text-footnote text-muted-foreground', !previewRule && 'invisible')}>
                {previewRule ? (isPreviewPending ? '…' : `${previewData?.matchCount ?? 0} 件ヒット`) : '0 件ヒット'}
              </span>
            </div>
            <Input
              {...register('keyword')}
              className={cn('h-9 text-body', keywordRegexError && 'border-destructive focus-visible:ring-destructive')}
              placeholder='検索キーワード'
              aria-invalid={keywordRegexError ? true : undefined}
            />
            {keywordRegexError && <p className='text-footnote text-destructive'>正規表現エラー: {keywordRegexError}</p>}
            <div className='flex flex-wrap gap-2'>
              <div className='flex min-w-0 flex-1 flex-col gap-1 sm:flex-none'>
                <span className='text-footnote font-semibold text-muted-foreground'>マッチ方法</span>
                <ToggleGroup
                  type='single'
                  value={keywordMode}
                  onValueChange={(v) => v && setValue('keywordMode', v as 'literal' | 'regex')}
                  className='w-full gap-1 sm:w-auto'
                >
                  <ToggleGroupItem value='literal' className='h-8 flex-1 px-3 text-footnote sm:flex-none'>
                    部分一致
                  </ToggleGroupItem>
                  <ToggleGroupItem value='regex' className='h-8 flex-1 px-3 text-footnote sm:flex-none'>
                    正規表現
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className='flex min-w-0 flex-1 flex-col gap-1 sm:flex-none'>
                <span className='text-footnote font-semibold text-muted-foreground'>対象</span>
                <ToggleGroup
                  type='single'
                  value={keywordTarget}
                  onValueChange={(v) => v && setValue('keywordTarget', v as 'title' | 'title_description')}
                  className='w-full gap-1 sm:w-auto'
                >
                  <ToggleGroupItem value='title' className='h-8 flex-1 px-3 text-footnote sm:flex-none'>
                    タイトル
                  </ToggleGroupItem>
                  <ToggleGroupItem value='title_description' className='h-8 flex-1 px-3 text-footnote sm:flex-none'>
                    タイトル+説明
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>

          {/* ── 4. 除外キーワード */}
          <div className='flex flex-col gap-1.5'>
            <Label className='text-footnote font-semibold text-muted-foreground'>除外キーワード</Label>
            <Input
              {...register('excludeKeyword')}
              className={cn(
                'h-9 text-body',
                excludeKeywordRegexError && 'border-destructive focus-visible:ring-destructive'
              )}
              placeholder='除外したいキーワード (任意)'
              aria-invalid={excludeKeywordRegexError ? true : undefined}
            />
            {excludeKeywordRegexError && (
              <p className='text-footnote text-destructive'>正規表現エラー: {excludeKeywordRegexError}</p>
            )}
          </div>

          {/* ── 5. チャンネルピッカー */}
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              <Label className='text-footnote font-semibold text-muted-foreground'>チャンネル</Label>
              {channelIds.length === 0 ? (
                <StatusChip variant='muted' size='sm'>
                  全て
                </StatusChip>
              ) : (
                <StatusChip variant='info' size='sm'>
                  {channelIds.length} 局
                </StatusChip>
              )}
            </div>
            <div className='rounded border border-border bg-card'>
              <ChannelPicker channels={channels} value={channelIds} onChange={(ids) => setValue('channelIds', ids)} />
            </div>
          </div>

          {/* ── 6. ジャンル */}
          <div className='flex flex-col gap-2'>
            <Label className='text-footnote font-semibold text-muted-foreground'>ジャンル</Label>
            <div className='flex flex-wrap gap-1.5'>
              {ARIB_GENRES.map((g) => {
                const active = genres.includes(g.value)
                return (
                  <button
                    key={g.value}
                    type='button'
                    onClick={() => {
                      if (active) {
                        setValue(
                          'genres',
                          genres.filter((v) => v !== g.value)
                        )
                      } else {
                        setValue('genres', [...genres, g.value])
                      }
                    }}
                    className={cn(
                      'rounded border px-2.5 py-1 text-footnote transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/12 text-primary'
                        : 'border-border bg-muted/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
            <p className={cn('text-footnote text-muted-foreground', genres.length > 0 && 'invisible')}>
              未選択 = 全ジャンル対象
            </p>
          </div>

          {/* ── 7. 曜日 */}
          <div className='flex flex-col gap-2'>
            <Label className='text-footnote font-semibold text-muted-foreground'>曜日</Label>
            <div className='flex gap-1.5'>
              {DOW_LABELS.map((label, idx) => {
                const active = dayOfWeek.includes(idx)
                return (
                  <button
                    key={label}
                    type='button'
                    onClick={() => {
                      if (active) {
                        setValue(
                          'dayOfWeek',
                          dayOfWeek.filter((d) => d !== idx)
                        )
                      } else {
                        setValue('dayOfWeek', [...dayOfWeek, idx].sort())
                      }
                    }}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center rounded border text-footnote font-semibold transition-colors sm:h-8 sm:w-8 sm:flex-none',
                      active
                        ? 'border-primary/40 bg-primary/12 text-primary'
                        : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── 8. 時刻範囲 */}
          <div className='flex flex-col gap-2'>
            <Label className='text-footnote font-semibold text-muted-foreground'>時刻範囲</Label>
            <div className='grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap'>
              {TIME_PRESETS.map((p) => {
                const isActive = activePreset?.label === p.label
                return (
                  <button
                    key={p.label}
                    type='button'
                    onClick={() => {
                      if (isActive) {
                        setValue('timeStartMinutes', null)
                        setValue('timeEndMinutes', null)
                      } else {
                        setValue('timeStartMinutes', p.start)
                        setValue('timeEndMinutes', p.end)
                      }
                    }}
                    className={cn(
                      'h-8 rounded border px-2.5 text-footnote transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/12 text-primary'
                        : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div className='flex items-center gap-2'>
              <Input
                className='h-8 w-24 font-mono tabular-nums text-footnote'
                placeholder='HH:MM'
                value={timeStart != null ? minutesToHHMM(timeStart) : ''}
                onChange={(e) => {
                  const mins = HHMMToMinutes(e.target.value)
                  setValue('timeStartMinutes', mins)
                }}
              />
              <span className='text-footnote text-muted-foreground'>〜</span>
              <Input
                className='h-8 w-24 font-mono tabular-nums text-footnote'
                placeholder='HH:MM'
                value={timeEnd != null ? minutesToHHMM(timeEnd) : ''}
                onChange={(e) => {
                  const mins = HHMMToMinutes(e.target.value)
                  setValue('timeEndMinutes', mins)
                }}
              />
              {(timeStart != null || timeEnd != null) && (
                <button
                  type='button'
                  className='text-footnote text-muted-foreground hover:text-destructive'
                  onClick={() => {
                    setValue('timeStartMinutes', null)
                    setValue('timeEndMinutes', null)
                  }}
                >
                  クリア
                </button>
              )}
            </div>
          </div>

          {/* ── 9. 優先度 */}
          <div className='flex flex-col gap-1.5'>
            <Label className='text-footnote font-semibold text-muted-foreground'>
              優先度<span className='ml-1.5 text-footnote text-muted-foreground'>(1=低 100=高、デフォルト50)</span>
            </Label>
            <Input
              type='number'
              min={1}
              max={100}
              {...register('priority', { valueAsNumber: true })}
              className='h-8 w-24 tabular-nums text-body'
            />
          </div>

          {/* ── 10. 重複回避 */}
          <div className='flex items-center gap-3'>
            <Switch
              id='avoidDuplicates'
              checked={avoidDuplicates}
              onCheckedChange={(v) => setValue('avoidDuplicates', v)}
            />
            <Label htmlFor='avoidDuplicates' className='cursor-pointer text-footnote text-foreground'>
              重複回避
            </Label>
          </div>

          {/* ── 11. ボタン群 */}
          <div className='flex flex-wrap items-center gap-2 border-t border-border pt-4'>
            <Button
              type='submit'
              size='sm'
              className='flex-1 text-footnote sm:flex-none'
              disabled={isPending || hasRegexError}
            >
              {isPending ? '保存中...' : existing ? '更新' : '作成'}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='flex-1 text-footnote sm:flex-none'
              onClick={() => navigate({ to: '/recordings/rules' })}
            >
              キャンセル
            </Button>
            {existing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='ml-auto h-8 gap-1.5 px-2.5 text-footnote text-destructive hover:bg-destructive/10 hover:text-destructive'
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className='size-3.5' />
                    削除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ルールを削除しますか？</AlertDialogTitle>
                    <AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className='text-footnote'>キャンセル</AlertDialogCancel>
                    <AlertDialogAction variant='destructive' className='text-footnote' onClick={onDelete}>
                      削除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </form>
      </div>

      {/* Preview pane */}
      <div className='flex w-full flex-col lg:min-w-0 lg:overflow-hidden'>
        <div className='border-b border-border px-4 py-2'>
          <span className='text-footnote font-semibold text-muted-foreground'>プレビュー（今週のヒット）</span>
        </div>
        <div className='flex-1 overflow-hidden'>
          <RulePreviewPane rule={previewRule} />
        </div>
      </div>
    </div>
  )
}
