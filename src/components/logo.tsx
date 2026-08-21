import { cn } from '@/lib/utils'

/**
 * Mark: two bars of unequal length inside a rounded frame, the shorter one
 * reaching for the longer. It reads as "how much of this role do you actually
 * cover" — the gap is the point, so the mark shows a gap rather than hiding it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      <rect
        x="1.25"
        y="1.25"
        width="21.5"
        height="21.5"
        rx="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <rect x="6" y="7.25" width="12" height="3" rx="1.5" fill="currentColor" />
      <rect x="6" y="13.75" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark className="text-primary size-6" />
      <span className="text-[0.9375rem] font-semibold tracking-tight">
        Role<span className="text-muted-foreground font-medium">Fit</span>
      </span>
    </span>
  )
}
