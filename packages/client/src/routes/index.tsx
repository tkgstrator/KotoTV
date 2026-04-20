import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChannelList } from '@/components/channel/ChannelList'
import { SegmentedFilter } from '@/components/shared/segmented-filter'
import { PageHeader } from '@/components/shell/PageHeader'
import { CHANNEL_TYPE_TABS, type ChannelType } from '@/lib/channel-type'

export const Route = createFileRoute('/')({
  component: IndexPage
})

function IndexPage() {
  const [filter, setFilter] = useState<ChannelType>('GR')

  return (
    <>
      <PageHeader ariaLabel='チャンネル種別フィルタ'>
        <SegmentedFilter ariaLabel='チャンネル種別' tabs={CHANNEL_TYPE_TABS} value={filter} onChange={setFilter} />
      </PageHeader>
      <ChannelList type={filter} />
    </>
  )
}
