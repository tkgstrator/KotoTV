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
      {/* Cap the filter at 480px (≈160px per tab) to match the EPG
          header, so 2-char labels don't splay across the full width. */}
      <PageHeader ariaLabel='チャンネル種別フィルタ'>
        <div className='flex min-w-0 max-w-[480px] flex-1 self-stretch'>
          <SegmentedFilter ariaLabel='チャンネル種別' tabs={CHANNEL_TYPE_TABS} value={filter} onChange={setFilter} />
        </div>
      </PageHeader>
      <ChannelList type={filter} />
    </>
  )
}
