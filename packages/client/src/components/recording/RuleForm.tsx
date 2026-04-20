import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, Trash2 } from 'lucide-react'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEncodeProfiles } from '@/hooks/useEncodeProfiles'
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
import type { EncodeProfile } from '@/types/EncodeProfile'
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

function buildDefaultValues(defaultProfile: EncodeProfile | undefined): CreateRecordingRule {
  return {
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
    avoidDuplicates: true,
    excludeReruns: false,
    newOnly: false,
    marginStartMinutes: 0,
    marginEndMinutes: 0,
    minDurationMinutes: 0,
    keepLatestN: 0,
    encodeProfileId: defaultProfile?.id ?? null
  }
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
    avoidDuplicates: existing.avoidDuplicates,
    excludeReruns: existing.excludeReruns,
    newOnly: existing.newOnly,
    marginStartMinutes: existing.marginStartMinutes,
    marginEndMinutes: existing.marginEndMinutes,
    minDurationMinutes: existing.minDurationMinutes,
    keepLatestN: existing.keepLatestN,
    encodeProfileId: existing.encodeProfileId
  }
}

// Shared className for the selected toggle — blue primary fill across
// every ToggleGroupItem used in this form.
const TOGGLE_ON =
  'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground'

export function RuleForm({ channels, existing }: RuleFormProps) {
  const navigate = useNavigate()
  const createMutation = useCreateRecordingRule()
  const updateMutation = useUpdateRecordingRule()
  const deleteMutation = useDeleteRecordingRule()
  const { data: encodeProfilesData } = useEncodeProfiles()
  const encodeProfiles = encodeProfilesData?.profiles ?? []
  const defaultProfile = encodeProfiles.find((p) => p.isDefault)

  const form = useForm<CreateRecordingRule>({
    defaultValues: existing ? toCreateRule(existing) : buildDefaultValues(defaultProfile)
  })

  useEffect(() => {
    if (existing) form.reset(toCreateRule(existing))
  }, [existing, form])

  const watched = form.watch()
  const keyword = watched.keyword
  const keywordMode = watched.keywordMode
  const excludeKeyword = watched.excludeKeyword
  const timeStart = watched.timeStartMinutes
  const timeEnd = watched.timeEndMinutes

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

  const previewHitCount = previewRule ? (isPreviewPending ? '…' : (previewData?.matchCount ?? 0)) : null

  return (
    <div className='flex h-full w-full flex-col overflow-hidden'>
      <div className='flex flex-1 flex-col overflow-y-auto'>
        <Collapsible className='border-b border-border/60'>
          <div className='flex items-center justify-end gap-2 bg-background px-4 py-2'>
            <CollapsibleTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='group h-8 gap-1.5 px-2.5 text-footnote text-muted-foreground hover:text-foreground'
              >
                <ChevronDown className='size-4 transition-transform group-data-[state=open]:rotate-180' />
                プレビュー
                {previewHitCount != null && (
                  <span className='tabular-nums text-caption text-muted-foreground'>({previewHitCount} 件)</span>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className='max-h-[420px] overflow-hidden border-t border-border'>
              <RulePreviewPane rule={previewRule} />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='grid grid-cols-1 gap-x-6 gap-y-5 p-4 xl:grid-cols-2'>
            {/* Left column — 検索条件 */}
            <div className='flex flex-col gap-5'>
              <FormField
                control={form.control}
                name='name'
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-footnote font-semibold text-muted-foreground'>ルール名</FormLabel>
                    <FormControl>
                      <Input {...field} className='h-9 text-body' placeholder='例: NHKスペシャル' autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='keyword'
                render={({ field }) => (
                  <FormItem className='gap-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <FormLabel className='text-footnote font-semibold text-muted-foreground'>キーワード</FormLabel>
                      <span
                        className={cn('tabular-nums text-footnote text-muted-foreground', !previewRule && 'invisible')}
                      >
                        {previewRule
                          ? isPreviewPending
                            ? '…'
                            : `${previewData?.matchCount ?? 0} 件ヒット`
                          : '0 件ヒット'}
                      </span>
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        className={cn(
                          'h-9 text-body',
                          keywordRegexError && 'border-destructive focus-visible:ring-destructive'
                        )}
                        placeholder='検索キーワード'
                        aria-invalid={keywordRegexError ? true : undefined}
                      />
                    </FormControl>
                    {keywordRegexError && (
                      <p className='text-footnote text-destructive'>正規表現エラー: {keywordRegexError}</p>
                    )}
                    <div className='flex flex-wrap gap-2'>
                      <FormField
                        control={form.control}
                        name='keywordMode'
                        render={({ field: modeField }) => (
                          <FormItem className='min-w-0 flex-1 gap-1 sm:flex-none'>
                            <FormLabel className='text-footnote font-semibold text-muted-foreground'>
                              マッチ方法
                            </FormLabel>
                            <FormControl>
                              <ToggleGroup
                                type='single'
                                variant='outline'
                                value={modeField.value}
                                onValueChange={(v) => v && modeField.onChange(v)}
                                className='w-full gap-1 sm:w-auto'
                              >
                                <ToggleGroupItem
                                  value='literal'
                                  className={cn('h-9 flex-1 px-3 text-body sm:flex-none', TOGGLE_ON)}
                                >
                                  部分一致
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                  value='regex'
                                  className={cn('h-9 flex-1 px-3 text-body sm:flex-none', TOGGLE_ON)}
                                >
                                  正規表現
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='keywordTarget'
                        render={({ field: targetField }) => (
                          <FormItem className='min-w-0 flex-1 gap-1 sm:flex-none'>
                            <FormLabel className='text-footnote font-semibold text-muted-foreground'>対象</FormLabel>
                            <FormControl>
                              <ToggleGroup
                                type='single'
                                variant='outline'
                                value={targetField.value}
                                onValueChange={(v) => v && targetField.onChange(v)}
                                className='w-full gap-1 sm:w-auto'
                              >
                                <ToggleGroupItem
                                  value='title'
                                  className={cn('h-9 flex-1 px-3 text-body sm:flex-none', TOGGLE_ON)}
                                >
                                  タイトル
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                  value='title_description'
                                  className={cn('h-9 flex-1 px-3 text-body sm:flex-none', TOGGLE_ON)}
                                >
                                  タイトル+説明
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='excludeKeyword'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-footnote font-semibold text-muted-foreground'>除外キーワード</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        className={cn(
                          'h-9 text-body',
                          excludeKeywordRegexError && 'border-destructive focus-visible:ring-destructive'
                        )}
                        placeholder='除外したいキーワード (任意)'
                        aria-invalid={excludeKeywordRegexError ? true : undefined}
                      />
                    </FormControl>
                    {excludeKeywordRegexError && (
                      <p className='text-footnote text-destructive'>正規表現エラー: {excludeKeywordRegexError}</p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='genres'
                render={({ field }) => (
                  <FormItem className='gap-2'>
                    <FormLabel className='text-footnote font-semibold text-muted-foreground'>ジャンル</FormLabel>
                    <div className='flex flex-wrap gap-1.5'>
                      {ARIB_GENRES.map((g) => {
                        const active = field.value.includes(g.value)
                        return (
                          <button
                            key={g.value}
                            type='button'
                            onClick={() =>
                              field.onChange(
                                active ? field.value.filter((v) => v !== g.value) : [...field.value, g.value]
                              )
                            }
                            className={cn(
                              'rounded border px-2.5 py-1 text-body transition-colors',
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
                    <p className={cn('text-footnote text-muted-foreground', field.value.length > 0 && 'invisible')}>
                      未選択 = 全ジャンル対象
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='dayOfWeek'
                render={({ field }) => (
                  <FormItem className='gap-2'>
                    <FormLabel className='text-footnote font-semibold text-muted-foreground'>曜日</FormLabel>
                    <div className='flex gap-1.5'>
                      {DOW_LABELS.map((label, idx) => {
                        const active = field.value.includes(idx)
                        return (
                          <button
                            key={label}
                            type='button'
                            onClick={() =>
                              field.onChange(
                                active ? field.value.filter((d) => d !== idx) : [...field.value, idx].sort()
                              )
                            }
                            className={cn(
                              'flex h-10 flex-1 items-center justify-center rounded border text-body font-semibold transition-colors sm:h-9 sm:w-11 sm:flex-none',
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
                  </FormItem>
                )}
              />

              <FormItem className='gap-2'>
                <FormLabel className='text-footnote font-semibold text-muted-foreground'>時刻範囲</FormLabel>
                <div className='grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap'>
                  {TIME_PRESETS.map((p) => {
                    const isActive = activePreset?.label === p.label
                    return (
                      <button
                        key={p.label}
                        type='button'
                        onClick={() => {
                          if (isActive) {
                            form.setValue('timeStartMinutes', null)
                            form.setValue('timeEndMinutes', null)
                          } else {
                            form.setValue('timeStartMinutes', p.start)
                            form.setValue('timeEndMinutes', p.end)
                          }
                        }}
                        className={cn(
                          'h-9 rounded border px-4 text-body transition-colors',
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
                  <FormField
                    control={form.control}
                    name='timeStartMinutes'
                    render={({ field }) => (
                      <Input
                        className='h-9 w-28 font-mono tabular-nums text-body'
                        placeholder='HH:MM'
                        value={field.value != null ? minutesToHHMM(field.value) : ''}
                        onChange={(e) => field.onChange(HHMMToMinutes(e.target.value))}
                      />
                    )}
                  />
                  <span className='text-footnote text-muted-foreground'>〜</span>
                  <FormField
                    control={form.control}
                    name='timeEndMinutes'
                    render={({ field }) => (
                      <Input
                        className='h-9 w-28 font-mono tabular-nums text-body'
                        placeholder='HH:MM'
                        value={field.value != null ? minutesToHHMM(field.value) : ''}
                        onChange={(e) => field.onChange(HHMMToMinutes(e.target.value))}
                      />
                    )}
                  />
                  {(timeStart != null || timeEnd != null) && (
                    <button
                      type='button'
                      className='text-footnote text-muted-foreground hover:text-destructive'
                      onClick={() => {
                        form.setValue('timeStartMinutes', null)
                        form.setValue('timeEndMinutes', null)
                      }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </FormItem>
            </div>

            {/* Right column — 対象・録画設定 */}
            <div className='flex flex-col gap-5'>
              <FormField
                control={form.control}
                name='channelIds'
                render={({ field }) => (
                  <FormItem className='gap-2'>
                    <div className='flex items-center gap-2'>
                      <FormLabel className='text-footnote font-semibold text-muted-foreground'>チャンネル</FormLabel>
                      {field.value.length === 0 ? (
                        <StatusChip variant='muted' size='sm'>
                          全て
                        </StatusChip>
                      ) : (
                        <StatusChip variant='info' size='sm'>
                          {field.value.length} 局
                        </StatusChip>
                      )}
                    </div>
                    <FormControl>
                      <ChannelPicker channels={channels} value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-footnote font-semibold text-muted-foreground'>
                      優先度
                      <span className='ml-1.5 text-footnote text-muted-foreground'>(1=低 100=高、デフォルト50)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={100}
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className='h-9 w-24 tabular-nums text-body'
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormItem className='gap-2'>
                <FormLabel className='text-footnote font-semibold text-muted-foreground'>録画オプション</FormLabel>
                <div className='flex flex-col gap-2'>
                  <FormField
                    control={form.control}
                    name='avoidDuplicates'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='cursor-pointer text-body text-foreground'>
                          タイトル重複は録画しない
                        </FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='excludeReruns'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='cursor-pointer text-body text-foreground'>再放送を録画しない</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='newOnly'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='cursor-pointer text-body text-foreground'>新番組のみ</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='encodeProfileId'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='text-body text-foreground'>録画後にエンコード</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value ?? 'none'}
                            onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                          >
                            <SelectTrigger className='h-9 w-[200px] text-body'>
                              <SelectValue placeholder='エンコードしない' />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='none'>エンコードしない</SelectItem>
                              {encodeProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.isDefault && ' (既定)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </FormItem>

              <FormItem className='gap-2'>
                <FormLabel className='text-footnote font-semibold text-muted-foreground'>詳細設定</FormLabel>
                <div className='flex flex-col gap-2.5'>
                  <FormField
                    control={form.control}
                    name='marginStartMinutes'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='text-body text-foreground'>開始マージン</FormLabel>
                        <div className='flex items-center gap-1.5'>
                          <FormControl>
                            <Input
                              type='number'
                              min={0}
                              max={60}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className='h-9 w-20 tabular-nums text-body'
                            />
                          </FormControl>
                          <span className='text-footnote text-muted-foreground'>分</span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='marginEndMinutes'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='text-body text-foreground'>終了マージン</FormLabel>
                        <div className='flex items-center gap-1.5'>
                          <FormControl>
                            <Input
                              type='number'
                              min={0}
                              max={60}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className='h-9 w-20 tabular-nums text-body'
                            />
                          </FormControl>
                          <span className='text-footnote text-muted-foreground'>分</span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='minDurationMinutes'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='text-body text-foreground'>最小番組長</FormLabel>
                        <div className='flex items-center gap-1.5'>
                          <FormControl>
                            <Input
                              type='number'
                              min={0}
                              max={1440}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className='h-9 w-20 tabular-nums text-body'
                            />
                          </FormControl>
                          <span className='text-footnote text-muted-foreground'>分 (0 で無効)</span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='keepLatestN'
                    render={({ field }) => (
                      <FormItem className='flex! items-center justify-between gap-3 space-y-0'>
                        <FormLabel className='text-body text-foreground'>保存世代数</FormLabel>
                        <div className='flex items-center gap-1.5'>
                          <FormControl>
                            <Input
                              type='number'
                              min={0}
                              max={999}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className='h-9 w-20 tabular-nums text-body'
                            />
                          </FormControl>
                          <span className='text-footnote text-muted-foreground'>本 (0 で無制限)</span>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </FormItem>
            </div>

            {/* Button row — span both columns */}
            <div className='flex flex-wrap items-center gap-2 border-t border-border pt-4 xl:col-span-2'>
              <Button
                type='submit'
                size='sm'
                className='h-8 flex-1 gap-1.5 px-3 text-footnote sm:flex-none sm:min-w-[120px]'
                disabled={isPending || hasRegexError}
              >
                {isPending ? '保存中...' : existing ? '更新' : '作成'}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-8 flex-1 gap-1.5 px-3 text-footnote sm:flex-none sm:min-w-[120px]'
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
        </Form>
      </div>
    </div>
  )
}
