'use client'

import * as React from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'

import { cn, scoreBandLabel, scoreBandVar } from '@/lib/utils'

type ScoreGaugeProps = {
  score: number
  /** Diameter in px. The stroke and type scale with it. */
  size?: number
  label?: string
  className?: string
}

/**
 * The match score, as an arc.
 *
 * A 270-degree arc rather than a full ring: a closed circle at 100% is
 * indistinguishable from a closed circle at 99%, because there is no visible
 * gap left to read against. The open gap at the bottom gives the eye a fixed
 * reference for "empty" and "full".
 *
 * The number is not decoration — it is the value. The arc is the redundant
 * encoding, which is the right way round for accessibility.
 */
export function ScoreGauge({ score, size = 220, label, className }: ScoreGaugeProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduceMotion = useReducedMotion()

  const stroke = Math.round(size * 0.075)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const SWEEP = 0.75 // 270deg of the circle carries the scale
  const arcLength = circumference * SWEEP

  const clamped = Math.max(0, Math.min(100, score))
  const progress = clamped / 100

  const shouldAnimate = inView && !reduceMotion

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex items-center justify-center', className)}
      role="img"
      aria-label={`Match score ${Math.round(clamped)} out of 100. ${label ?? scoreBandLabel(clamped)}.`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // -135deg puts the gap at the bottom, centred.
        style={{ transform: 'rotate(135deg)' }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--score-track)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreBandVar(clamped)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          initial={{ strokeDashoffset: reduceMotion ? arcLength * (1 - progress) : arcLength }}
          animate={shouldAnimate ? { strokeDashoffset: arcLength * (1 - progress) } : undefined}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <ScoreNumber value={clamped} animate={shouldAnimate} size={size} />
        <span
          className="text-muted-foreground mt-1 text-[0.625rem] font-medium uppercase tracking-[0.14em]"
          style={{ fontSize: Math.max(9, size * 0.05) }}
        >
          {label ?? 'match'}
        </span>
      </div>
    </div>
  )
}

function ScoreNumber({
  value,
  animate,
  size,
}: {
  value: number
  animate: boolean
  size: number
}) {
  // `null` means "not counting yet" — render the real score, not a zero.
  // Same reasoning as useCountUp: if requestAnimationFrame never fires (no JS,
  // hidden tab, headless render) a zero-seeded counter shows a wrong number
  // forever. The count-up is an enhancement on top of a correct value.
  const [counted, setCounted] = React.useState<number | null>(null)

  const display = animate && counted !== null ? counted : Math.round(value)

  React.useEffect(() => {
    if (!animate) return

    let frame = 0
    let start: number | null = null
    const duration = 1150

    const step = (now: number) => {
      start ??= now
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - t) ** 3
      setCounted(Math.round(value * eased))
      if (t < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, animate])

  return (
    <span
      className="tabular font-semibold leading-none"
      style={{ fontSize: size * 0.26 }}
      data-score={Math.round(value)}
    >
      {display}
    </span>
  )
}
