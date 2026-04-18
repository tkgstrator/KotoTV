import { createFileRoute, Link } from '@tanstack/react-router'
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
      <PageHeader ariaLabel='新規ルールヘッダー' className='items-center gap-2 px-3'>
        <Link to='/recordings' className='font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground'>
          録画
        </Link>
        <span className='font-mono text-[0.6875rem] text-border'>/</span>
        <Link to='/recordings/rules' className='font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground'>
          録画ルール
        </Link>
        <span className='font-mono text-[0.6875rem] text-border'>/</span>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>新規ルール</h1>
      </PageHeader>
      <div className='flex flex-1 overflow-hidden'>
        <RuleForm channels={channels} />
      </div>
    </div>
  )
}
