import { cn } from '@/lib/utils'

/**
 * The colour layer that the frosted panels blur.
 *
 * Glassmorphism over a flat background is just a translucent grey box — the
 * effect only exists if there is something varied behind it. These blobs are
 * that something.
 *
 * Implemented as radial gradients with a soft alpha falloff rather than a
 * hard-edged shape under `filter: blur()`. A 120px blur on three viewport-sized
 * elements is a genuinely expensive composite on integrated graphics, and it
 * buys nothing a gradient stop cannot do. `will-change` is deliberately absent
 * for the same reason: promoting three huge layers costs more than the drift
 * animation saves.
 *
 * Hues are held in the cool 190-290 range. Warm hues belong to the score ramp
 * and are never spent on decoration.
 */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grain pointer-events-none fixed inset-0 -z-10 overflow-hidden',
        className,
      )}
    >
      <div
        className="animate-[--animate-aurora-drift] absolute -left-[18%] -top-[28%] size-[70vw] rounded-full"
        style={{ background: 'radial-gradient(circle at center, var(--aurora-1), transparent 68%)' }}
      />
      <div
        className="animate-[--animate-aurora-drift] absolute -right-[14%] top-[6%] size-[58vw] rounded-full [animation-delay:-9s]"
        style={{ background: 'radial-gradient(circle at center, var(--aurora-2), transparent 68%)' }}
      />
      <div
        className="animate-[--animate-aurora-drift] absolute left-[22%] top-[52%] size-[62vw] rounded-full [animation-delay:-17s]"
        style={{ background: 'radial-gradient(circle at center, var(--aurora-3), transparent 70%)' }}
      />
    </div>
  )
}
