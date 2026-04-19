/**
 * Manual (non-Radix) tab button className. Used by TypeFilter — it can't
 * use the Shadcn Tabs `underline` variant because its state lives outside
 * Radix. Keep the class output identical to what `variant='underline'`
 * produces so both surfaces render the same chrome.
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
