import { createFileRoute } from '@tanstack/react-router'
import { PhasePlaceholder } from '@/components/shell/PhasePlaceholder'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage() {
  return (
    <PhasePlaceholder title='設定' phase='Phase 6' note='システム設定・ヘルスモニタリングはPhase 6で実装予定です。' />
  )
}
