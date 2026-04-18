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
      <PageHeader ariaLabel='チャンネル種別フィルタ'>
        <TypeFilter value={filter} onChange={setFilter} />
      </PageHeader>
      {filter === 'ALL' ? <ChannelList /> : <ChannelList type={filter} />}
    </>
  )
}
