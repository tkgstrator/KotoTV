import { createFileRoute } from '@tanstack/react-router'
import { RuleForm } from '@/components/recording/RuleForm'
import { PageHeader } from '@/components/shell/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useChannels } from '@/hooks/useChannels'
import { useRecordingRule } from '@/hooks/useRecordingRules'

export const Route = createFileRoute('/recordings/rules/$id')({
  component: EditRulePage
})

function EditRulePage() {
  const { id } = Route.useParams()
  const { data: channelsData } = useChannels()
  const channels = channelsData?.channels ?? []
  const { data: rule, isPending, isError } = useRecordingRule(id)

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <PageHeader ariaLabel='ルール編集ヘッダー' className='items-center px-4'>
        <h1 className='min-w-0 truncate text-body font-bold text-foreground'>{rule?.name ?? id}</h1>
      </PageHeader>

      {isPending && (
        <div className='flex flex-col gap-2 p-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton
            <Skeleton key={i} className='h-10 w-full rounded' />
          ))}
        </div>
      )}

      {isError && (
        <div className='px-4 py-12'>
          <div className='inline-block rounded-sm border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-footnote text-destructive'>
            ルールが見つかりません（ID: {id}）
          </div>
        </div>
      )}

      {!isPending && !isError && rule && (
        <div className='flex flex-1 overflow-hidden'>
          <RuleForm channels={channels} existing={rule} />
        </div>
      )}
    </div>
  )
}
