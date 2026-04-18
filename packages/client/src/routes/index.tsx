import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChannelList } from '@/components/channel/ChannelList'
import { type FilterValue, TypeFilter } from '@/components/channel/TypeFilter'

export const Route = createFileRoute('/')({
  component: IndexPage
})

function IndexPage() {
  const [filter, setFilter] = useState<FilterValue>('ALL')

  return (
    <>
      <TypeFilter value={filter} onChange={setFilter} />
      {filter === 'ALL' ? <ChannelList /> : <ChannelList type={filter} />}
    </>
  )
}
