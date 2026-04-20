import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { CreateRecordingScheduleSchema } from '@kototv/server/src/schemas/Recording.dto'
import { addDays } from 'date-fns'
import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useChannels } from '@/hooks/useChannels'
import { useEncodeProfiles } from '@/hooks/useEncodeProfiles'
import { usePrograms } from '@/hooks/usePrograms'
import { useCreateRecording } from '@/hooks/useRecordings'

interface FormState {
  channelId: string
  programId: string
  title: string
  startAt: string
  endAt: string
  encodeProfileId: string | null
}

interface FormErrors {
  channelId?: string
  programId?: string
  title?: string
  startAt?: string
  endAt?: string
  _form?: string
}

const EMPTY: FormState = {
  channelId: '',
  programId: '',
  title: '',
  startAt: '',
  endAt: '',
  encodeProfileId: null
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(local: string): string {
  return new Date(local).toISOString()
}

interface EpgResultsProps {
  channels: Channel[]
  programs: Program[]
  query: string
  onSelect: (p: Program) => void
}

function EpgResults({ channels, programs, query, onSelect }: EpgResultsProps) {
  const channelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ch of channels) m.set(ch.id, ch.name)
    return m
  }, [channels])

  const filtered = useMemo(() => {
    if (!query.trim()) return programs.slice(0, 30)
    const q = query.toLowerCase()
    return programs.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 30)
  }, [programs, query])

  if (filtered.length === 0) {
    return (
      <p className='px-3.5 py-4 font-mono text-caption text-muted-foreground'>
        {query ? '一致する番組が見つかりません' : 'EPG データを読み込み中...'}
      </p>
    )
  }

  return (
    <div>
      {filtered.map((p) => {
        const chName = channelMap.get(p.channelId) ?? p.channelId
        const start = new Date(p.startAt)
        const end = new Date(p.endAt)
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000)
        const label = `${start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} · ${durationMin}min`

        return (
          <button
            type='button'
            key={`${p.channelId}-${p.id}`}
            className='flex w-full cursor-pointer items-center gap-2.5 border-b border-border/50 px-3.5 py-2 text-left transition-colors hover:bg-muted/60'
            onClick={() => onSelect(p)}
          >
            <span className='shrink-0 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-caption2 font-bold text-primary'>
              {chName}
            </span>
            <div className='min-w-0 flex-1'>
              <p className='truncate font-mono text-footnote font-semibold text-foreground'>{p.title}</p>
              <p className='font-mono text-caption2 text-muted-foreground'>{label}</p>
            </div>
            <Button
              type='button'
              size='sm'
              className='h-6 shrink-0 px-2 font-mono text-caption2 font-bold'
              onClick={(e) => {
                e.stopPropagation()
                onSelect(p)
              }}
            >
              RESERVE
            </Button>
          </button>
        )
      })}
    </div>
  )
}

interface RecordingScheduleFormProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function RecordingScheduleForm({ open, onOpenChange }: RecordingScheduleFormProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [fields, setFields] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const { mutateAsync, isPending } = useCreateRecording()
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: channelsData } = useChannels()
  const channels = channelsData?.channels ?? []
  const { data: encodeProfilesData } = useEncodeProfiles()
  const encodeProfiles = encodeProfilesData?.profiles ?? []
  const now = useMemo(() => new Date(), [])
  const startAtBound = now.toISOString()
  const endAtBound = useMemo(() => addDays(now, 7).toISOString(), [now])

  const { data: programsData } = usePrograms({ startAt: startAtBound, endAt: endAtBound })
  const allPrograms: Program[] = programsData?.programs ?? []

  function set(patch: Partial<FormState>) {
    setFields((prev) => ({ ...prev, ...patch }))
    setErrors({})
  }

  function fillFromProgram(program: Program) {
    setFields((prev) => ({
      channelId: program.channelId,
      programId: program.id,
      title: program.title,
      startAt: program.startAt,
      endAt: program.endAt,
      encodeProfileId: prev.encodeProfileId
    }))
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = CreateRecordingScheduleSchema.safeParse(fields)
    if (!result.success) {
      const errs: FormErrors = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormErrors
        if (key && !errs[key]) errs[key] = issue.message
      }
      setErrors(errs)
      return
    }
    await mutateAsync(result.data)
    setFields(EMPTY)
    setSearchQuery('')
    setErrors({})
    onOpenChange(false)
  }

  function handleClose(v: boolean) {
    if (!v) {
      setFields(EMPTY)
      setSearchQuery('')
      setErrors({})
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='flex max-h-[calc(100vh-80px)] w-full max-w-[640px] flex-col gap-0 overflow-hidden p-0'>
        <DialogHeader className='flex-row items-center gap-2 border-b border-border px-3.5 py-3'>
          <Search className='size-4 shrink-0 text-muted-foreground' />
          <Input
            ref={searchRef}
            className='h-auto flex-1 border-none bg-transparent p-0 font-mono text-body font-semibold shadow-none focus-visible:ring-0'
            placeholder='番組名を入力... (例: NHKスペシャル)'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <DialogTitle className='sr-only'>新規録画予約</DialogTitle>
        </DialogHeader>

        <div className='overflow-y-auto'>
          <div>
            <p className='px-3.5 pb-1 pt-2.5 font-mono text-caption2 font-bold uppercase tracking-widest text-muted-foreground'>
              EPG RESULTS
            </p>
            <EpgResults channels={channels} programs={allPrograms} query={searchQuery} onSelect={fillFromProgram} />
          </div>

          <form onSubmit={handleSubmit}>
            <div className='border-t border-border px-3.5 py-3'>
              <p className='mb-3 font-mono text-caption2 font-bold uppercase tracking-widest text-muted-foreground'>
                MANUAL ENTRY
              </p>

              {errors._form && <p className='mb-2 font-mono text-caption2 text-destructive'>{errors._form}</p>}

              <div className='flex flex-wrap gap-3'>
                <div className='min-w-[140px]'>
                  <Label className='mb-1 block font-mono text-caption2 uppercase tracking-wider text-muted-foreground'>
                    CHANNEL
                  </Label>
                  <Select value={fields.channelId} onValueChange={(v) => set({ channelId: v })}>
                    <SelectTrigger className='h-8 font-mono text-footnote'>
                      <SelectValue placeholder='選択...' />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id} className='font-mono text-footnote'>
                          {ch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.channelId && (
                    <p className='mt-1 font-mono text-caption2 text-destructive'>{errors.channelId}</p>
                  )}
                </div>

                <div className='min-w-[200px] flex-1'>
                  <Label className='mb-1 block font-mono text-caption2 uppercase tracking-wider text-muted-foreground'>
                    TITLE
                  </Label>
                  <Input
                    className='h-8 font-mono text-footnote'
                    placeholder='番組タイトル'
                    value={fields.title}
                    onChange={(e) => set({ title: e.target.value })}
                  />
                  {errors.title && <p className='mt-1 font-mono text-caption2 text-destructive'>{errors.title}</p>}
                </div>

                <div>
                  <Label className='mb-1 block font-mono text-caption2 uppercase tracking-wider text-muted-foreground'>
                    START
                  </Label>
                  <Input
                    type='datetime-local'
                    className='h-8 font-mono text-footnote'
                    value={fields.startAt ? toDatetimeLocal(fields.startAt) : ''}
                    onChange={(e) => set({ startAt: e.target.value ? fromDatetimeLocal(e.target.value) : '' })}
                  />
                  {errors.startAt && <p className='mt-1 font-mono text-caption2 text-destructive'>{errors.startAt}</p>}
                </div>

                <div>
                  <Label className='mb-1 block font-mono text-caption2 uppercase tracking-wider text-muted-foreground'>
                    END
                  </Label>
                  <Input
                    type='datetime-local'
                    className='h-8 font-mono text-footnote'
                    value={fields.endAt ? toDatetimeLocal(fields.endAt) : ''}
                    onChange={(e) => set({ endAt: e.target.value ? fromDatetimeLocal(e.target.value) : '' })}
                  />
                  {errors.endAt && <p className='mt-1 font-mono text-caption2 text-destructive'>{errors.endAt}</p>}
                </div>
              </div>

              <div className='mt-3'>
                <Label className='mb-1 block font-mono text-caption2 uppercase tracking-wider text-muted-foreground'>
                  ENCODE
                </Label>
                <Select
                  value={fields.encodeProfileId ?? 'none'}
                  onValueChange={(v) => set({ encodeProfileId: v === 'none' ? null : v })}
                >
                  <SelectTrigger className='h-8 w-[240px] font-mono text-footnote'>
                    <SelectValue placeholder='エンコードしない' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none' className='font-mono text-footnote'>
                      エンコードしない
                    </SelectItem>
                    {encodeProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id} className='font-mono text-footnote'>
                        {p.name}
                        {p.isDefault && ' (既定)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='mt-4 flex gap-2'>
                <Button type='submit' size='sm' className='font-mono text-footnote font-bold' disabled={isPending}>
                  {isPending ? 'SCHEDULING...' : 'SCHEDULE'}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='font-mono text-footnote'
                  onClick={() => handleClose(false)}
                >
                  CANCEL
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
