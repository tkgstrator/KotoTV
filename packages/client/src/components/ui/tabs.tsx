import { cva, type VariantProps } from 'class-variance-authority'
import { Tabs as TabsPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/utils'

function Tabs({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot='tabs'
      data-orientation={orientation}
      orientation={orientation}
      className={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  )
}

/**
 * - default / line: Shadcn originals — pill-shaped list, optional underline marker.
 * - underline: app-wide convention for top-level page tabs. Fills the sticky
 *   header slot, shows a primary-colored bottom line on the active trigger,
 *   no extra chrome (matches TypeFilter on the channel list / EPG).
 */
const tabsListVariants = cva(
  'group/tabs-list inline-flex items-center text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
  {
    variants: {
      variant: {
        default: 'h-9 w-fit justify-center rounded-lg bg-muted p-[3px] group-data-[orientation=horizontal]/tabs:h-9',
        line: 'h-9 w-fit justify-center gap-1 rounded-none bg-transparent p-[3px] group-data-[orientation=horizontal]/tabs:h-9',
        // Height intentionally unset — consumer picks h-10 (dense) or h-page-header (full).
        underline: 'w-full justify-start rounded-none bg-transparent p-0'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot='tabs-list'
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * Trigger styling is selected via `group-data-[variant=...]/tabs-list:` so the
 * variant state lives on the parent TabsList (no prop drilling needed).
 */
const TABS_TRIGGER_BASE =
  'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4'

// default: rounded pill + shadow on active (Shadcn original)
const TABS_TRIGGER_DEFAULT =
  'group-data-[variant=default]/tabs-list:h-[calc(100%-1px)] group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:border group-data-[variant=default]/tabs-list:border-transparent group-data-[variant=default]/tabs-list:px-2 group-data-[variant=default]/tabs-list:py-1 group-data-[variant=default]/tabs-list:text-sm group-data-[variant=default]/tabs-list:font-medium group-data-[variant=default]/tabs-list:text-foreground/60 hover:group-data-[variant=default]/tabs-list:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:bg-background group-data-[variant=default]/tabs-list:data-[state=active]:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm dark:group-data-[variant=default]/tabs-list:text-muted-foreground dark:hover:group-data-[variant=default]/tabs-list:text-foreground'

// line: pill track but underline marker via ::after on active
const TABS_TRIGGER_LINE =
  'group-data-[variant=line]/tabs-list:h-[calc(100%-1px)] group-data-[variant=line]/tabs-list:flex-1 group-data-[variant=line]/tabs-list:rounded-md group-data-[variant=line]/tabs-list:border group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-2 group-data-[variant=line]/tabs-list:py-1 group-data-[variant=line]/tabs-list:text-sm group-data-[variant=line]/tabs-list:font-medium group-data-[variant=line]/tabs-list:text-foreground/60 hover:group-data-[variant=line]/tabs-list:text-foreground group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:bottom-[-5px] group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:bg-foreground group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100'

// underline: app-wide convention — tab fills list height, 2px primary underline on active.
const TABS_TRIGGER_UNDERLINE =
  'group-data-[variant=underline]/tabs-list:h-full group-data-[variant=underline]/tabs-list:border-0 group-data-[variant=underline]/tabs-list:border-b-2 group-data-[variant=underline]/tabs-list:border-b-transparent group-data-[variant=underline]/tabs-list:rounded-none group-data-[variant=underline]/tabs-list:px-4 group-data-[variant=underline]/tabs-list:py-2 group-data-[variant=underline]/tabs-list:text-sm group-data-[variant=underline]/tabs-list:font-medium group-data-[variant=underline]/tabs-list:text-muted-foreground hover:group-data-[variant=underline]/tabs-list:text-foreground group-data-[variant=underline]/tabs-list:data-[state=active]:border-b-primary group-data-[variant=underline]/tabs-list:data-[state=active]:text-foreground group-data-[variant=underline]/tabs-list:data-[state=active]:font-semibold'

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot='tabs-trigger'
      className={cn(TABS_TRIGGER_BASE, TABS_TRIGGER_DEFAULT, TABS_TRIGGER_LINE, TABS_TRIGGER_UNDERLINE, className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot='tabs-content' className={cn('flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants }
