import { createFileRoute } from '@tanstack/react-router'
import { PhasePlaceholder } from '@/components/shell/PhasePlaceholder'

export const Route = createFileRoute('/epg')({
  component: EpgPage
})

function EpgPage() {
  return <PhasePlaceholder title='番組表' phase='Phase 3' note='タイムライン形式の番組表はPhase 3で実装予定です。' />
}
