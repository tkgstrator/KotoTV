import type { Channel } from '@kototv/server/src/schemas/Channel.dto'
import { useMemo } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface ChannelPickerProps {
  channels: Channel[]
  value: string[]
  onChange: (ids: string[]) => void
}

const TYPE_ORDER = ['GR', 'BS', 'CS']
const TYPE_LABELS: Record<string, string> = { GR: '地上波 (GR)', BS: 'BS', CS: 'CS' }

export function ChannelPicker({ channels, value, onChange }: ChannelPickerProps) {
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

  function isGroupAllSelected(type: string) {
    return groups[type]?.every((ch) => value.includes(ch.id)) ?? false
  }

  function isGroupPartialSelected(type: string) {
    const g = groups[type] ?? []
    const selectedCount = g.filter((ch) => value.includes(ch.id)).length
    return selectedCount > 0 && selectedCount < g.length
  }

  function toggleGroup(type: string) {
    const g = groups[type] ?? []
    if (isGroupAllSelected(type)) {
      onChange(value.filter((id) => !g.some((ch) => ch.id === id)))
    } else {
      const toAdd = g.map((ch) => ch.id).filter((id) => !value.includes(id))
      onChange([...value, ...toAdd])
    }
  }

  function toggleChannel(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  if (channels.length === 0) {
    return <p className='font-mono text-[0.6875rem] text-muted-foreground'>$ no channels — チャンネルスキャン未完了</p>
  }

  return (
    <Accordion type='multiple' defaultValue={types} className='w-full'>
      {types.map((type) => (
        <AccordionItem key={type} value={type} className='border-border'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={`group-${type}`}
              checked={isGroupAllSelected(type) ? true : isGroupPartialSelected(type) ? 'indeterminate' : false}
              onCheckedChange={() => toggleGroup(type)}
              className='ml-1'
            />
            <AccordionTrigger className='flex-1 py-2 font-mono text-[0.75rem] font-bold text-foreground hover:no-underline'>
              <Label htmlFor={`group-${type}`} className='cursor-pointer font-mono text-[0.75rem] font-bold'>
                {TYPE_LABELS[type] ?? type}
              </Label>
              <span className='ml-auto mr-2 font-mono text-[0.625rem] text-muted-foreground'>
                {value.filter((id) => groups[type]?.some((ch) => ch.id === id)).length}/{groups[type]?.length ?? 0}
              </span>
            </AccordionTrigger>
          </div>
          <AccordionContent className='pb-1'>
            {/* Fixed 4-column grid so rows align perfectly; labels truncate within cells. */}
            <div className='grid grid-cols-2 gap-x-3 gap-y-1 pl-6 pr-2 sm:grid-cols-3 lg:grid-cols-4'>
              {(groups[type] ?? []).map((ch) => (
                <div key={ch.id} className='flex min-w-0 items-center gap-2'>
                  <Checkbox
                    id={`ch-${ch.id}`}
                    checked={value.includes(ch.id)}
                    onCheckedChange={() => toggleChannel(ch.id)}
                  />
                  <Label
                    htmlFor={`ch-${ch.id}`}
                    className='cursor-pointer truncate font-mono text-[0.6875rem] text-foreground'
                    title={ch.name}
                  >
                    {ch.name}
                  </Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
