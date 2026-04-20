import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface ChannelPickerProps {
  channels: Channel[]
  value: string[]
  onChange: (ids: string[]) => void
}

const TYPE_ORDER = ['GR', 'BS', 'CS']
const TYPE_LABELS: Record<string, string> = { GR: '地上波', BS: 'BS', CS: 'CS' }

export function ChannelPicker({ channels, value, onChange }: ChannelPickerProps) {
  const [open, setOpen] = useState(false)

  const groups = useMemo(() => {
    const map: Record<string, Channel[]> = {}
    for (const ch of channels) {
      if (!map[ch.type]) map[ch.type] = []
      ;(map[ch.type] as Channel[]).push(ch)
    }
    return map
  }, [channels])

  const types = useMemo(() => {
    const known = TYPE_ORDER.filter((t) => groups[t])
    const others = Object.keys(groups).filter((t) => !TYPE_ORDER.includes(t))
    return [...known, ...others]
  }, [groups])

  function toggleChannel(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id))
    else onChange([...value, id])
  }

  const selectedNames = channels.filter((c) => value.includes(c.id)).map((c) => c.name)
  const triggerLabel =
    value.length === 0 ? '全チャンネル対象' : value.length <= 2 ? selectedNames.join('、') : `${value.length} 局選択中`

  if (channels.length === 0) {
    return <p className='text-footnote text-muted-foreground'>チャンネルスキャンが完了していません</p>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className='h-9 w-full justify-between px-3 text-body font-normal'
        >
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>{triggerLabel}</span>
          <ChevronsUpDown className='size-4 shrink-0 opacity-60' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[--radix-popover-trigger-width] min-w-[280px] p-0' align='start'>
        <Command>
          <CommandInput placeholder='チャンネル検索' />
          <CommandList>
            <CommandEmpty>該当するチャンネルがありません</CommandEmpty>
            {types.map((type) => (
              <CommandGroup key={type} heading={TYPE_LABELS[type] ?? type}>
                {(groups[type] ?? []).map((ch) => {
                  const selected = value.includes(ch.id)
                  return (
                    <CommandItem
                      key={ch.id}
                      value={`${TYPE_LABELS[type] ?? type} ${ch.name} ${ch.id}`}
                      onSelect={() => toggleChannel(ch.id)}
                    >
                      <Check className={cn('size-4', selected ? 'text-primary' : 'text-transparent')} />
                      <span className='truncate'>{ch.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
          {value.length > 0 && (
            <>
              <CommandSeparator />
              <div className='p-1'>
                <CommandItem
                  onSelect={() => onChange([])}
                  className='justify-center text-destructive data-[selected=true]:text-destructive'
                >
                  <X className='size-4' />
                  選択をクリア
                </CommandItem>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
