import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RecordingsReserveAction } from '@/components/recording/recordings-reserve-action'
import { PageHeader } from '@/components/shell/PageHeader'

export const Route = createFileRoute('/recordings/encoding')({
  component: EncodePage
})

function EncodePage() {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <>
      <PageHeader ariaLabel='エンコードヘッダー'>
        <h2 className='flex h-full items-center text-subheadline font-semibold text-foreground'>エンコード</h2>
      </PageHeader>
      <div className='flex-1 overflow-y-auto pb-16'>
        <div className='px-4 py-12'>
          <p className='text-footnote text-muted-foreground'>
            エンコードキューは現在空です — 録画完了後にエンコードジョブが自動で追加されます
          </p>
        </div>
      </div>

      <RecordingsReserveAction open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
