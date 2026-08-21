'use client'

import * as React from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'

import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------
   Motion primitives.

   Everything here honours `useReducedMotion()` by collapsing to a static
   render rather than a faster animation. A user who has asked the OS to stop
   moving things wants them to stop, not to hurry.
------------------------------------------------------------------------- */

const EASE_OUT = [0.16, 1, 0.3, 1] as const

// `motion.div` widens `children` to accept MotionValues, which a plain <div>
// cannot render. Narrow it back so the reduced-motion branch typechecks.
type RevealProps = Omit<React.ComponentProps<typeof motion.div>, 'children'> & {
  children?: React.ReactNode
  /** Seconds to wait before starting. Use for a hand-tuned sequence. */
  delay?: number
  /** Travel distance in px. Negative values come from above. */
  y?: number
  /** Fraction of the element that must be visible before it fires. */
  amount?: number
}

/** Fade-and-rise as the element scrolls into view. Fires once. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
  amount = 0.25,
  ...props
}: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className={className} {...(props as React.ComponentProps<'div'>)}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.62, delay, ease: EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Staggers its direct children. Each child needs to be a `RevealItem` — the
 * parent only orchestrates timing, it does not animate itself.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.09,
  amount = 0.2,
}: {
  children: React.ReactNode
  className?: string
  stagger?: number
  amount?: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function RevealItem({
  children,
  className,
  y = 18,
}: {
  children: React.ReactNode
  className?: string
  y?: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Scroll-linked parallax. `speed` is how far the element drifts across its own
 * scroll pass, as a fraction of the viewport — 0.12 is a subtle lift, 0.4 is
 * obvious. Negative moves against the scroll direction.
 */
export function Parallax({
  children,
  className,
  speed = 0.15,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const distance = speed * 100
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance])
  const smoothed = useSpring(y, { stiffness: 120, damping: 26, mass: 0.4 })

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduceMotion ? undefined : { y: smoothed }}>{children}</motion.div>
    </div>
  )
}

/** Thin progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 32, restDelta: 0.001 })

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="bg-primary fixed inset-x-0 top-0 z-50 h-0.5 origin-left"
    />
  )
}

/**
 * Counts a number up as it enters view. Returns a plain string via a motion
 * value subscription so React re-renders once per frame instead of on every
 * intermediate value.
 */
export function useCountUp(
  target: number,
  { duration = 1.1, decimals = 0 }: { duration?: number; decimals?: number } = {},
): { ref: React.RefObject<HTMLSpanElement | null>; value: string } {
  const ref = React.useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()

  // `null` means "not counting yet", and in that state we render the real
  // number rather than a zero.
  //
  // Seeding this at 0 was a bug: the server rendered "0", so the true figure
  // only ever appeared once requestAnimationFrame had run. Anything that stops
  // rAF firing — no JavaScript, a backgrounded tab, a headless renderer —
  // showed a permanent, confident, wrong zero. Correct-by-default, animated as
  // an enhancement.
  const [animated, setAnimated] = React.useState<string | null>(null)

  const value = reduceMotion || animated === null ? target.toFixed(decimals) : animated

  React.useEffect(() => {
    if (reduceMotion) return

    const node = ref.current
    if (!node) return

    let frame = 0
    let start: number | null = null
    let observer: IntersectionObserver | null = null

    const step = (now: number) => {
      start ??= now
      const elapsed = (now - start) / 1000
      const t = Math.min(elapsed / duration, 1)
      // easeOutCubic — fast then settling, which reads as "landing on" a value
      const eased = 1 - (1 - t) ** 3
      setAnimated((target * eased).toFixed(decimals))
      if (t < 1) frame = requestAnimationFrame(step)
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect()
          frame = requestAnimationFrame(step)
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(node)

    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [target, duration, decimals, reduceMotion])

  return { ref, value }
}

/** Re-export so consumers do not each import from motion directly. */
export { motion, useScroll, useTransform, useSpring, useReducedMotion }
export type { MotionValue }

export function GlassPanel({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & { children: React.ReactNode }) {
  return (
    <div className={cn('glass rounded-2xl', className)} {...props}>
      {children}
    </div>
  )
}
