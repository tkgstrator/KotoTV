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
      {/* Fixed 480px (≈160px per tab) — EPG mirrors this width so the
          two pages feel like the same filter bar. `max-w-full` keeps it
          safe on narrow viewports. */}
      <PageHeader ariaLabel='チャンネル種別フィルタ'>
        <div className='flex h-full w-[480px] max-w-full self-stretch'>
          <SegmentedFilter ariaLabel='チャンネル種別' tabs={CHANNEL_TYPE_TABS} value={filter} onChange={setFilter} />
        </div>
      </PageHeader>
      <ChannelList type={filter} />
    </>
  )
}
