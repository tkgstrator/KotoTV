import { createFileRoute } from '@tanstack/react-router'
import { SUBSYSTEMS } from '@/components/settings/_shared'
import { AboutTab } from '@/components/settings/AboutTab'
import { DisplayTab } from '@/components/settings/DisplayTab'
import { PlaybackTab } from '@/components/settings/PlaybackTab'
import { RecordingTab } from '@/components/settings/RecordingTab'
import { StatusTab } from '@/components/settings/StatusTab'
import { StatusChip } from '@/components/shared/status-chip'
import { PageHeader } from '@/components/shell/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

import { TAB_LIST_CLASS, TAB_TRIGGER_CLASS } from '@/lib/tab-bar'

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

function SettingsPage() {
  return (
    <>
      <PageHeader ariaLabel='設定ヘッダー' className='items-center gap-2 px-3'>
        <h1 className='font-mono text-[0.9375rem] font-bold leading-none'>設定</h1>
      </PageHeader>

      <HealthStrip />

      <Tabs defaultValue='status' className='flex flex-1 flex-col'>
        <div className='sticky top-[calc(var(--page-header-h)+48px)] z-10 shrink-0 overflow-x-auto border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value='status' className={TAB_TRIGGER_CLASS}>
              ステータス
            </TabsTrigger>
            <TabsTrigger value='playback' className={TAB_TRIGGER_CLASS}>
              再生
            </TabsTrigger>
            <TabsTrigger value='recording' className={TAB_TRIGGER_CLASS}>
              録画
            </TabsTrigger>
            <TabsTrigger value='display' className={TAB_TRIGGER_CLASS}>
              表示設定
            </TabsTrigger>
            <TabsTrigger value='about' className={TAB_TRIGGER_CLASS}>
              情報
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='status' className='mt-0 flex-1'>
          <StatusTab />
        </TabsContent>
        <TabsContent value='playback' className='mt-0 flex-1'>
          <PlaybackTab />
        </TabsContent>
        <TabsContent value='recording' className='mt-0 flex-1'>
          <RecordingTab />
        </TabsContent>
        <TabsContent value='display' className='mt-0 flex-1'>
          <DisplayTab />
        </TabsContent>
        <TabsContent value='about' className='mt-0 flex-1'>
          <AboutTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
