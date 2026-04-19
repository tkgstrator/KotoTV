/**
 * Shared tab-bar styling tokens.
 *
 * Every sticky tab bar in the app (channel TypeFilter, EPG TypeFilter,
 * /recordings tabs, /settings tabs) must be visually identical: the
 * container is `h-page-header` (48px) with `border-b border-border`,
 * and active triggers show a 2px primary underline (no pill / no outline).
 *
 * Export the className strings from one place so future tweaks stay in
 * sync. TypeFilter uses the manual variant because it isn't backed by
 * Radix Tabs.
 */

/**
 * Wrapper around Shadcn's TabsList. Overrides the default h-9 + pill chrome
 * so the bar fills the page-header slot and only shows a bottom underline.
 */
export const TAB_LIST_CLASS = '!h-page-header w-full justify-start rounded-none bg-transparent p-0'

/**
 * Shadcn TabsTrigger shared className. Neutralizes the default rounded-md +
 * 4-sided border + bg-background active chrome, leaves only a bottom-border
 * underline colored with primary on active.
 */
export const TAB_TRIGGER_CLASS = [
  '!h-full !border-0 !border-b-2 !border-b-transparent rounded-none',
  'px-4 py-2 text-sm font-medium text-muted-foreground transition-colors',
  'hover:text-foreground',
  'data-[state=active]:!border-b-primary data-[state=active]:!bg-transparent',
  'data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none'
].join(' ')

/**
 * Manual (non-Radix) tab button className. TypeFilter uses plain
 * <button role="tab"> so there's no data-state attribute; pass `active`
 * in via a conditional className instead.
 */
export function manualTabClass(active: boolean): string {
  return [
    'flex-1 h-full border-b-2 -mb-px px-4 text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    active
      ? 'text-foreground border-b-primary font-semibold'
      : 'text-muted-foreground border-b-transparent hover:text-foreground/80'
  ].join(' ')
}
