import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { RuleForm } from '@/components/recording/RuleForm'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { useChannels } from '@/hooks/useChannels'

export const Route = createFileRoute('/recordings/rules/new')({
  component: NewRulePage
})

function NewRulePage() {
  const { data: channelsData } = useChannels()
  const channels = channelsData?.channels ?? []

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <PageHeader ariaLabel='新規ルールヘッダー' className='items-center gap-2 pl-2 pr-3'>
        <Link to='/recordings/rules' aria-label='録画ルール一覧へ戻る'>
          <Button variant='ghost' size='icon' className='size-9 text-muted-foreground hover:text-foreground'>
            <ChevronLeft className='size-5' />
          </Button>
        </Link>
        <h1 className='text-body font-bold text-foreground'>新規ルール</h1>
      </PageHeader>
      <div className='flex flex-1 overflow-hidden'>
        <RuleForm channels={channels} />
      </div>
    </div>
  )
}
