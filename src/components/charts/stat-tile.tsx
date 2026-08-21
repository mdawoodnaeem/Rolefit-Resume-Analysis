'use client'

import * as React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { useCountUp } from '@/components/motion-primitives'
import { cn } from '@/lib/utils'

type StatTileProps = {
  label: string
  value: number
  /** Rendered immediately after the number, e.g. '%' or '/100'. */
  suffix?: string
  decimals?: number
  /** Period-over-period change in percentage points. Omit to hide the delta. */
  delta?: number
  /** For metrics where down is good (e.g. time-to-response). */
  lowerIsBetter?: boolean
  hint?: string
  className?: string
}

/**
 * A single headline figure.
 *
 * Deliberately not a chart: one number over one period has no shape to show,
 * and wrapping it in axes would add ink without adding information. The delta
 * carries an arrow as well as a colour so direction survives greyscale and
 * colour-vision deficiency.
 */
export function StatTile({
  label,
  value,
  suffix,
  decimals = 0,
  delta,
  lowerIsBetter = false,
  hint,
  className,
}: StatTileProps) {
  const { ref, value: display } = useCountUp(value, { decimals })

  const isGood = delta === undefined ? null : lowerIsBetter ? delta < 0 : delta > 0
  const TrendIcon = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown

  return (
    <div className={cn('glass rounded-2xl p-5', className)}>
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{label}</p>

      <div className="mt-3 flex items-baseline gap-2">
        <span ref={ref} className="tabular text-3xl font-semibold leading-none sm:text-4xl">
          {display}
        </span>
        {suffix ? (
          <span className="text-muted-foreground text-lg font-medium leading-none">{suffix}</span>
        ) : null}
      </div>

      {delta !== undefined ? (
        <p
          className={cn(
            'mt-3 flex items-center gap-1 text-xs font-medium',
            isGood ? 'text-score-good' : 'text-score-poor',
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden="true" />
          <span className="tabular">
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}
          </span>
          <span className="text-muted-foreground font-normal">vs. previous period</span>
        </p>
      ) : null}

      {hint ? <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{hint}</p> : null}
    </div>
  )
}
