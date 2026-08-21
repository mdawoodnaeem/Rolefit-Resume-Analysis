import { CircleAlert, CircleCheck, CircleMinus, Lightbulb, type LucideIcon } from 'lucide-react'

import { SEVERITY_LABELS, sortGaps, type Gap, type GapSeverity } from '@/lib/schemas/analysis'
import { Badge } from '@/components/ui/badge'
import { pluralize } from '@/lib/utils'

const SEVERITY_ICON: Record<GapSeverity, LucideIcon> = {
  critical: CircleAlert,
  important: CircleMinus,
  nice_to_have: CircleCheck,
}

const SEVERITY_VARIANT: Record<GapSeverity, 'critical' | 'important' | 'nice'> = {
  critical: 'critical',
  important: 'important',
  nice_to_have: 'nice',
}

/**
 * What the candidate is actually missing.
 *
 * Sorted hardest-first, because the order in which someone reads this decides
 * what they do next, and burying a Critical gap under three nice-to-haves is
 * how a tool ends up being polite instead of useful.
 *
 * Severity carries an icon as well as a colour. The dark palette's worst
 * adjacent pair sits in the CVD band that is only permissible alongside
 * secondary encoding, so these icons are load-bearing.
 */
export function GapList({ gaps }: { gaps: readonly Gap[] }) {
  const sorted = sortGaps(gaps)
  const criticalCount = sorted.filter((gap) => gap.severity === 'critical').length

  if (sorted.length === 0) return <NoGaps />

  return (
    <section aria-labelledby="gaps-heading" className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gaps-heading" className="text-sm font-medium">
          Gap analysis
        </h2>
        <p className="text-muted-foreground text-xs">
          {sorted.length} {pluralize(sorted.length, 'gap')}
          {criticalCount > 0 ? ` · ${criticalCount} critical` : null}
        </p>
      </div>

      <ul className="mt-5 space-y-4">
        {sorted.map((gap, index) => {
          const Icon = SEVERITY_ICON[gap.severity]

          return (
            <li
              key={`${gap.requirement}-${index}`}
              className="border-border/60 border-b pb-4 last:border-b-0 last:pb-0"
            >
              <div className="flex items-start gap-3">
                <Icon
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: `var(--severity-${SEVERITY_VARIANT[gap.severity]})` }}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{gap.requirement}</h3>
                    <Badge variant={SEVERITY_VARIANT[gap.severity]}>
                      {SEVERITY_LABELS[gap.severity]}
                    </Badge>
                    {gap.reframeable ? (
                      <Badge variant="outline" title="You already have adjacent experience here">
                        Reframeable
                      </Badge>
                    ) : null}
                  </div>

                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    <span className="opacity-70">The posting says: </span>
                    {gap.evidence}
                  </p>

                  <p className="mt-2.5 flex gap-2 text-sm leading-relaxed">
                    <Lightbulb
                      className="text-primary mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{gap.suggestedAction}</span>
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function NoGaps() {
  return (
    <section aria-labelledby="gaps-heading" className="glass rounded-2xl p-5 sm:p-6">
      <h2 id="gaps-heading" className="text-sm font-medium">
        Gap analysis
      </h2>
      <div className="mt-5 flex items-start gap-3">
        <CircleCheck className="text-score-good mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          No gaps found against the stated requirements. That is unusual — check the parsed job
          description above and make sure the requirements were read correctly.
        </p>
      </div>
    </section>
  )
}
