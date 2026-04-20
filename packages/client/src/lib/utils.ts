import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge treats any `text-<name>` class that doesn't match a
// built-in size token as a color — so mixing `text-footnote` with a color
// like `text-primary` inside a single cn() call caused one to be dropped.
// Register our custom font-size tokens (defined in tech.css) so they are
// only treated as conflicting with other sizes, not colors.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-caption2', 'text-caption', 'text-footnote', 'text-subheadline', 'text-body', 'text-title3']
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
