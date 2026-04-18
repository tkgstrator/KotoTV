import { createFileRoute } from '@tanstack/react-router'
import { PhasePlaceholder } from '@/components/shell/PhasePlaceholder'

export const Route = createFileRoute('/recordings')({
  component: RecordingsPage
})

function RecordingsPage() {
  return <PhasePlaceholder title='録画' phase='Phase 4' note='録画一覧・スケジュール管理はPhase 4で実装予定です。' />
}
