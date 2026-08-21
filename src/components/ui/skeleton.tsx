import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Loading placeholder.
 *
 * The pulse is an opacity oscillation rather than a sweeping gradient: a sweep
 * animates `background-position` across a large painted area, which is the kind
 * of thing that shows up on a low-end laptop when a dozen of these are on
 * screen at once during an analysis.
 *
 * Skeletons are `aria-hidden` and the surrounding region carries `aria-busy`,
 * so a screen reader announces "loading" once instead of reading out a dozen
 * empty boxes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-muted animate-[--animate-shimmer] rounded-md', className)}
      {...props}
    />
  )
}

/** Multi-line text placeholder with a ragged last line, so it reads as prose. */
function SkeletonText({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<'div'> & { lines?: number }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true" {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? 'w-[62%]' : 'w-full')}
        />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText }
