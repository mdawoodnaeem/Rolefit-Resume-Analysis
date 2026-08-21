import { Check, X } from 'lucide-react'

import type { KeywordReport } from '@/lib/schemas/analysis'
import { Badge } from '@/components/ui/badge'
import { cn, pluralize, scoreBandTextClass } from '@/lib/utils'

/**
 * ATS keyword coverage.
 *
 * Computed in code, not by a model, so the number is exactly reproducible —
 * which the copy says out loud, because a coverage figure that wobbles between
 * runs is worse than no figure.
 *
 * Suggestions never say "add this keyword". Padding a resume with terms you
 * cannot defend is the failure mode this product exists to refuse; the
 * suggestion text points at honest adjacent experience instead.
 */
export function KeywordReportCard({ report }: { report: KeywordReport }) {
  const total = report.present.length + report.missing.length

  return (
    <section aria-labelledby="ats-heading" className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ats-heading" className="text-sm font-medium">
          ATS keyword coverage
        </h2>
        <p className={cn('tabular text-sm font-semibold', scoreBandTextClass(report.coverage))}>
          {report.coverage}%
        </p>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {report.present.length} of {total} screening {pluralize(total, 'term')} found. Matched by
        exact string comparison, so this figure is identical every run.
      </p>

      <div className="bg-score-track mt-4 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(1, report.coverage)}%` }}
        />
      </div>

      {report.present.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Found in your resume
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {report.present.map((term) => (
              <li key={term}>
                <Badge variant="present" className="gap-1">
                  <Check aria-hidden="true" />
                  {term}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.missing.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Not found
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {report.missing.map((term) => (
              <li key={term}>
                <Badge variant="missing" className="gap-1">
                  <X aria-hidden="true" />
                  {term}
                </Badge>
              </li>
            ))}
          </ul>

          {report.suggestions.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {report.suggestions.slice(0, 6).map((suggestion) => (
                <li
                  key={suggestion.term}
                  className="text-muted-foreground text-xs leading-relaxed"
                >
                  <span className="text-foreground font-medium">{suggestion.term}</span> —{' '}
                  {suggestion.suggestion}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
