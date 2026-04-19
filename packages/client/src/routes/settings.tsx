import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { SUBSYSTEMS } from '@/components/settings/_shared'
import { AboutTab } from '@/components/settings/AboutTab'
import { DisplayTab } from '@/components/settings/DisplayTab'
import { PlaybackTab } from '@/components/settings/PlaybackTab'
import { RecordingTab } from '@/components/settings/RecordingTab'
import { StatusTab } from '@/components/settings/StatusTab'
import { StatusChip } from '@/components/shared/status-chip'
import { UnderlineTabBar } from '@/components/shared/underline-tab-bar'
import { PageHeader } from '@/components/shell/PageHeader'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function HealthStrip() {
  const { data } = useHealth()

  const anyWarn = data
    ? [...SUBSYSTEMS.map((s) => data[s.key].status), data.disk.status].some((s) => s !== 'ok')
    : false

  return (
    <div
      role='status'
      aria-label='システム健全性'
      className={cn(
        'sticky top-page-header z-10 flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        anyWarn && 'border-b-amber-500/30 bg-amber-500/[0.04]'
      )}
    >
      {SUBSYSTEMS.map(({ key, label }) => {
        const sub = data?.[key]
        const st = sub?.status ?? 'ok'
        return (
          <div
            key={key}
            className='flex shrink-0 items-center gap-1.5 border-r border-border px-3.5 py-[5px] last:border-r-0'
          >
            <span className='font-mono text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground'>
              {label}
            </span>
            <StatusChip variant={st} size='sm'>
              {st.toUpperCase()}
            </StatusChip>
            {sub && (
              <span className={cn('font-mono text-[0.5625rem] text-muted-foreground', st !== 'ok' && 'text-amber-500')}>
                {sub.detail}
              </span>
            )}
          </div>
        )
      })}
      <div className='ml-auto flex shrink-0 items-center px-3.5'>
        <span className='font-mono text-[0.5625rem] text-muted-foreground/60'>更新 15s</span>
      </div>
    </div>
  )
}

type SettingsTab = 'status' | 'playback' | 'recording' | 'display' | 'about'

const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
  { value: 'status', label: 'ステータス' },
  { value: 'playback', label: '再生' },
  { value: 'recording', label: '録画' },
  { value: 'display', label: '表示設定' },
  { value: 'about', label: '情報' }
]

function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('status')

  return (
    <>
      <PageHeader ariaLabel='設定ヘッダー' className='items-center gap-2 px-3'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>設定</h1>
      </PageHeader>

      <HealthStrip />

      <div className='sticky top-[calc(var(--page-header-h)+48px)] z-10 shrink-0 overflow-x-auto bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <UnderlineTabBar<SettingsTab>
          tabs={SETTINGS_TABS}
          value={tab}
          onChange={setTab}
          ariaLabel='設定タブ'
          heightClass='h-10'
          className='bg-card'
        />
      </div>

      <div className='flex-1'>
        {tab === 'status' && <StatusTab />}
        {tab === 'playback' && <PlaybackTab />}
        {tab === 'recording' && <RecordingTab />}
        {tab === 'display' && <DisplayTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </>
  )
}
