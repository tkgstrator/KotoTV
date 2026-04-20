import { createFileRoute } from '@tanstack/react-router'
import { RuleForm } from '@/components/recording/RuleForm'
import { useChannels } from '@/hooks/useChannels'

export const Route = createFileRoute('/recordings/rules/new')({
  component: NewRulePage
})

function NewRulePage() {
  const { data: channelsData } = useChannels()
  const channels = channelsData?.channels ?? []

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <RuleForm channels={channels} />
    </div>
  )
}
