import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChannelList } from '@/components/channel/ChannelList'
import { type FilterValue, TypeFilter } from '@/components/channel/TypeFilter'
import { PageHeader } from '@/components/shell/PageHeader'

export const Route = createFileRoute('/')({
  component: IndexPage
})

function IndexPage() {
  const [filter, setFilter] = useState<FilterValue>('ALL')

  return (
    <>
      <PageHeader ariaLabel='チャンネルヘッダー' className='items-center gap-2 px-3'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>チャンネル</h1>
        <div className='flex-1' />
        <TypeFilter value={filter} onChange={setFilter} />
      </PageHeader>
      {filter === 'ALL' ? <ChannelList /> : <ChannelList type={filter} />}
    </>
  )
}
