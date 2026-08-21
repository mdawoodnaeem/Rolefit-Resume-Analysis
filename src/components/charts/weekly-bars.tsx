'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export type WeeklyDatum = {
  /** Short axis label, e.g. 'Mar 4'. */
  label: string
  value: number
}

type WeeklyBarsProps = {
  title: string
  data: readonly WeeklyDatum[]
  className?: string
  /** Accessible description of what the bars encode. */
  caption?: string
}

/**
 * Applications submitted per week.
 *
 * One series, so there is no legend — the title names it. Following the mark
 * spec: thin bars, 4px rounded top anchored flat to the baseline (a fully
 * rounded bar detaches from the axis and misreads its own value), a 2px
 * surface gap between neighbours, and a recessive baseline instead of a grid.
 *
 * Only the extremes carry a direct label. Numbering every bar is noise; the
 * reader wants the shape plus the peak, and the tooltip covers the rest.
 */
export function WeeklyBars({ title, data, className, caption }: WeeklyBarsProps) {
  const [hovered, setHovered] = React.useState<number | null>(null)

  const max = Math.max(...data.map((d) => d.value), 1)
  const peakIndex = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0)

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <figure className={cn('glass rounded-2xl p-5', className)}>
      <figcaption className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground tabular text-xs">{total} total</span>
      </figcaption>

      <div
        className="mt-5 flex h-36 items-end gap-[2px]"
        role="img"
        aria-label={
          caption ??
          `${title}. ${data.map((d) => `${d.label}: ${d.value}`).join(', ')}. Peak ${data[peakIndex]!.value} in ${data[peakIndex]!.label}.`
        }
      >
        {data.map((datum, index) => {
          const heightPct = (datum.value / max) * 100
          const isActive = hovered === index
          const showLabel = index === peakIndex || isActive

          return (
            <div
              key={datum.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {showLabel ? (
                <span
                  className={cn(
                    'tabular absolute inset-x-0 -top-0.5 text-center text-[0.6875rem] font-medium',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {datum.value}
                </span>
              ) : null}

              <div
                className={cn(
                  'bg-primary w-full rounded-t-[4px] transition-[height,opacity] duration-500 ease-out',
                  hovered !== null && !isActive ? 'opacity-45' : 'opacity-100',
                )}
                style={{ height: `calc(${Math.max(heightPct, 2)}% - 18px)` }}
              />
            </div>
          )
        })}
      </div>

      {/* Recessive baseline. A full grid would out-ink the data at this size. */}
      <div className="bg-border mt-0 h-px w-full" />

      <div className="text-muted-foreground mt-2 flex gap-[2px] text-[0.625rem]">
        {data.map((datum, index) => (
          <span
            key={datum.label}
            className={cn(
              'flex-1 truncate text-center',
              // Thin out labels on narrow layouts: every other one.
              index % 2 === 1 && 'hidden sm:block',
            )}
          >
            {datum.label}
          </span>
        ))}
      </div>

      {/* The bars are a picture; this is the same data as data. It gives
          screen-reader and keyboard users the exact values without pinning a
          fake tabIndex on a decorative div, and satisfies the requirement that
          every chart has a table equivalent. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Applications</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label}>
              <th scope="row">{datum.label}</th>
              <td>{datum.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
