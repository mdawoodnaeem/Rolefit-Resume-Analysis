import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors [&>svg]:size-3 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground border-border',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',

        // Gap severity. These read as data, not decoration, so they use a tinted
        // surface plus a matching border rather than a solid fill — a wall of
        // solid red chips in the gap list is unreadable.
        critical:
          'border-severity-critical/35 bg-severity-critical/12 text-severity-critical',
        important:
          'border-severity-important/35 bg-severity-important/12 text-severity-important',
        nice: 'border-severity-nice/35 bg-severity-nice/12 text-severity-nice',

        // ATS keyword coverage
        present: 'border-score-good/35 bg-score-good/12 text-score-good',
        missing: 'border-score-poor/35 bg-score-poor/12 text-score-poor',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
