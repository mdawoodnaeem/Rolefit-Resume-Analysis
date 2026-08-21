'use client'

import * as React from 'react'
import { CircleAlert, CircleCheck, CircleMinus, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Score bands as they appear in aggregate.
 *
 * Three colours, not four. The `strong` and `good` bands share a fill because
 * a four-step traffic light cannot separate green from teal well enough for a
 * fully sighted reader, let alone a colour-vision-deficient one — so the
 * distribution buckets at three and the finer label lives on the individual
 * score readout.
 *
 * Every band carries an icon and a written label. The dark palette's worst
 * adjacent pair sits in the 6-8 CVD band, which is permitted only with this
 * kind of secondary encoding, so the icons are load-bearing, not ornament.
 */

type Band = {
  key: 'poor' | 'fair' | 'good'
  label: string
  range: string
  color: string
  Icon: LucideIcon
}

const BANDS: readonly Band[] = [
  {
    key: 'poor',
    label: 'Weak',
    range: '0–44',
    color: 'var(--score-poor)',
    Icon: CircleAlert,
  },
  {
    key: 'fair',
    label: 'Partial',
    range: '45–64',
    color: 'var(--score-fair)',
    Icon: CircleMinus,
  },
  {
    key: 'good',
    label: 'Strong',
    range: '65–100',
    color: 'var(--score-good)',
    Icon: CircleCheck,
  },
]

export type ScoreDistributionData = Record<Band['key'], number>

export function ScoreDistribution({
  data,
  title = 'Match score distribution',
  className,
}: {
  data: ScoreDistributionData
  title?: string
  className?: string
}) {
  const total = BANDS.reduce((sum, band) => sum + data[band.key], 0)

  return (
    <figure className={cn('glass rounded-2xl p-5', className)}>
      <figcaption className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground tabular text-xs">
          {total} {total === 1 ? 'application' : 'applications'}
        </span>
      </figcaption>

      {/* Single stacked bar. Segments are separated by a 2px surface gap so
          adjacent fills never touch and read as one blob. */}
      <div className="mt-5 flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
        {BANDS.map((band) => {
          const share = total === 0 ? 0 : (data[band.key] / total) * 100
          if (share === 0) return null
          return (
            <div
              key={band.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${share}%`, backgroundColor: band.color }}
            />
          )
        })}
        {total === 0 ? <div className="bg-score-track h-full w-full rounded-full" /> : null}
      </div>

      <ul className="mt-5 space-y-3">
        {BANDS.map((band) => {
          const count = data[band.key]
          const share = total === 0 ? 0 : Math.round((count / total) * 100)

          return (
            <li key={band.key} className="flex items-center gap-3">
              <band.Icon
                className="size-4 shrink-0"
                style={{ color: band.color }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{band.label}</span>
              <span className="text-muted-foreground text-xs">{band.range}</span>
              <span className="tabular text-muted-foreground ml-auto text-xs">{share}%</span>
              <span className="tabular w-6 text-right text-sm font-medium">{count}</span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
