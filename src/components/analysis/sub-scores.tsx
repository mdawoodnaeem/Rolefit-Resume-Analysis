import { ChevronRight, Quote } from 'lucide-react'

import {
  SUB_SCORE_LABELS,
  SUB_SCORE_WEIGHTS,
  subScoreKeys,
  type MatchReport,
} from '@/lib/schemas/analysis'
import { cn, scoreBandTextClass, scoreBandVar } from '@/lib/utils'

/**
 * The score breakdown.
 *
 * Every row discloses the evidence it was derived from. That is the whole
 * point of the product, so the disclosure is a native `<details>` rather than
 * a scripted accordion: it works before hydration, it is keyboard operable and
 * screen-reader announced without any ARIA of ours, and it prints expanded.
 *
 * Weights are shown next to each dimension. A user who disagrees with a score
 * deserves to know how much it moved the headline.
 */
export function SubScores({ report }: { report: MatchReport }) {
  return (
    <section aria-labelledby="breakdown-heading" className="glass rounded-2xl p-5 sm:p-6">
      <h2 id="breakdown-heading" className="text-sm font-medium">
        Score breakdown
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Each dimension cites the lines it was derived from.
      </p>

      <ul className="mt-5 space-y-1">
        {subScoreKeys.map((key) => {
          const sub = report.subScores[key]
          const weight = Math.round(SUB_SCORE_WEIGHTS[key] * 100)

          return (
            <li key={key}>
              <details className="group border-border/60 border-b last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{SUB_SCORE_LABELS[key]}</span>
                    <span className="text-muted-foreground text-xs">{weight}% of the total</span>
                  </span>

                  <span className="hidden w-28 sm:block">
                    <span className="bg-score-track block h-1.5 overflow-hidden rounded-full">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(2, sub.score)}%`,
                          backgroundColor: scoreBandVar(sub.score),
                        }}
                      />
                    </span>
                  </span>

                  <span
                    className={cn(
                      'tabular w-9 text-right text-sm font-semibold',
                      scoreBandTextClass(sub.score),
                    )}
                  >
                    {sub.score}
                  </span>
                </summary>

                <div className="pb-4 pl-7 pr-1">
                  <p className="text-muted-foreground text-sm leading-relaxed">{sub.reasoning}</p>

                  <ul className="mt-3 space-y-2">
                    {sub.evidence.map((quote, index) => (
                      <li
                        key={`${key}-evidence-${index}`}
                        className="text-muted-foreground flex gap-2 text-xs leading-relaxed"
                      >
                        <Quote
                          className="mt-0.5 size-3 shrink-0 opacity-60"
                          aria-hidden="true"
                        />
                        <span>{quote}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
