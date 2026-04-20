import { createFileRoute } from '@tanstack/react-router'
import { RuleForm } from '@/components/recording/RuleForm'
import { PageHeader } from '@/components/shell/PageHeader'
import { useChannels } from '@/hooks/useChannels'

export const Route = createFileRoute('/recordings/rules/new')({
  component: NewRulePage
})

function NewRulePage() {
  const { data: channelsData } = useChannels()
  const channels = channelsData?.channels ?? []

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <PageHeader ariaLabel='新規ルールヘッダー' className='items-center px-4'>
        <h1 className='text-body font-bold text-foreground'>新規ルール</h1>
      </PageHeader>
      <div className='flex flex-1 overflow-hidden'>
        <RuleForm channels={channels} />
      </div>
    </div>
  )
}
