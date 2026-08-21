'use client'

import * as React from 'react'
import { Check, ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { changeRatio, diffWords, hasChanges, sideTokens, type RenderToken } from '@/lib/diff/word-diff'
import { cn, pluralize } from '@/lib/utils'
import type { CritiqueReport, DiffSegment } from '@/lib/schemas/tailored'

/**
 * Side-by-side rewrite with per-change control.
 *
 * Two distinct kinds of "not applied" exist here and conflating them would be
 * dishonest:
 *
 *   - **Rejected by the grounding check.** The rewrite asserted something the
 *     source resume does not support. These are shown with the reason and are
 *     *not* toggleable. Letting someone re-enable a claim the system just
 *     caught as fabricated would make the whole check theatre.
 *
 *   - **Declined by the user.** They read the change and preferred their own
 *     wording. Freely toggleable.
 *
 * Nothing is applied wholesale. The default state mirrors the critique's
 * verdicts, and the user narrows from there.
 */
export function RewriteDiff({
  segments,
  critique,
  onAcceptedChange,
}: {
  segments: readonly DiffSegment[]
  critique: CritiqueReport
  onAcceptedChange?: (acceptedIds: string[]) => void
}) {
  // Only segments the critique cleared are eligible; it seeds the initial set.
  const [accepted, setAccepted] = React.useState<ReadonlySet<string>>(
    () => new Set(segments.filter((segment) => segment.accepted).map((segment) => segment.id)),
  )

  const toggle = React.useCallback(
    (id: string) => {
      setAccepted((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        onAcceptedChange?.([...next])
        return next
      })
    },
    [onAcceptedChange],
  )

  const rejectedByCheck = segments.filter((segment) => !segment.accepted)

  // "Changed" means the text actually differs, not merely that the critique
  // cleared it. Counting cleared-but-identical segments as changes produced a
  // header reading "5 of 5 changes kept" above five rows each saying "left
  // unchanged" — a claim the page itself contradicted.
  const changed = React.useMemo(
    () => segments.filter((segment) => hasChanges(diffWords(segment.original, segment.tailored))),
    [segments],
  )

  const changedIds = React.useMemo(() => new Set(changed.map((s) => s.id)), [changed])
  const keptCount = [...accepted].filter((id) => changedIds.has(id)).length
  const editable = changed.filter((segment) => segment.accepted)

  return (
    <div className="space-y-4">
      <CritiqueSummary critique={critique} rejectedCount={rejectedByCheck.length} />

      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Proposed changes</h2>
          {changed.length > 0 ? (
            <p className="text-muted-foreground tabular text-xs">
              {keptCount} of {editable.length} {pluralize(editable.length, 'change')} kept
            </p>
          ) : null}
        </div>

        {changed.length === 0 ? (
          <NoTextualChanges segmentCount={segments.length} />
        ) : (
          <ul className="mt-5 space-y-3">
            {changed.map((segment) => (
              <li key={segment.id}>
                <DiffRow
                  segment={segment}
                  accepted={accepted.has(segment.id)}
                  onToggle={() => toggle(segment.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Shown when the rewrite changed no wording at all.
 *
 * Listing every untouched bullet as a row would fill the screen with
 * "unchanged" and imply work happened that did not. Demo mode reaches this
 * every time by design: it reorders bullets within a role rather than
 * rewriting them, and reordering is invisible in a per-bullet diff.
 */
function NoTextualChanges({ segmentCount }: { segmentCount: number }) {
  return (
    <div className="border-border/60 mt-5 rounded-xl border border-dashed p-5 text-center">
      <p className="text-sm font-medium">No wording changes proposed</p>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm leading-relaxed">
        All {segmentCount} {pluralize(segmentCount, 'section')} were left exactly as you wrote
        them. In demo mode the rewrite only reorders bullets to put the most relevant first, which
        does not alter any individual line — so there is nothing to compare here.
      </p>
    </div>
  )
}

function CritiqueSummary({
  critique,
  rejectedCount,
}: {
  critique: CritiqueReport
  rejectedCount: number
}) {
  const clean = rejectedCount === 0
  const Icon = clean ? ShieldCheck : ShieldAlert

  return (
    <section
      className={cn(
        'glass flex items-start gap-3 rounded-2xl p-5',
        clean ? 'border-score-good/25' : 'border-severity-important/30',
      )}
      aria-labelledby="critique-heading"
    >
      <Icon
        className={cn('mt-0.5 size-5 shrink-0', clean ? 'text-score-good' : 'text-severity-important')}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <h2 id="critique-heading" className="text-sm font-medium">
          {clean
            ? 'Grounding check passed'
            : `${rejectedCount} ${pluralize(rejectedCount, 'claim')} removed`}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{critique.summary}</p>
      </div>
    </section>
  )
}

function DiffRow({
  segment,
  accepted,
  onToggle,
}: {
  segment: DiffSegment
  accepted: boolean
  onToggle: () => void
}) {
  const tokens = React.useMemo(
    () => diffWords(segment.original, segment.tailored),
    [segment.original, segment.tailored],
  )

  const blocked = !segment.accepted
  const changed = hasChanges(tokens)

  if (!changed && !blocked) {
    return (
      <div className="border-border/60 rounded-xl border border-dashed px-4 py-3">
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">{segment.label}</span> — left unchanged.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'border-border/60 rounded-xl border p-4 transition-opacity',
        blocked && 'opacity-75',
        !blocked && !accepted && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{segment.label}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {blocked ? segment.rejectedReason : segment.rationale}
          </p>
        </div>

        {blocked ? (
          <Badge variant="critical" className="gap-1 shrink-0">
            <ShieldAlert aria-hidden="true" />
            Not grounded
          </Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={accepted ? 'default' : 'outline'}
            onClick={onToggle}
            aria-pressed={accepted}
            className="shrink-0"
          >
            {accepted ? <Check aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
            {accepted ? 'Keeping' : 'Using original'}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Column
          heading="Your original"
          tokens={sideTokens(tokens, 'before')}
          muted={!blocked && accepted}
        />
        <Column
          heading={blocked ? 'Rejected rewrite' : 'Tailored'}
          tokens={sideTokens(tokens, 'after')}
          muted={blocked || !accepted}
          strike={blocked}
        />
      </div>
    </div>
  )
}

function Column({
  heading,
  tokens,
  muted,
  strike,
}: {
  heading: string
  tokens: readonly RenderToken[]
  muted: boolean
  strike?: boolean
}) {
  return (
    <div>
      <h4 className="text-muted-foreground text-[0.625rem] font-medium uppercase tracking-wider">
        {heading}
      </h4>
      <p
        className={cn(
          'mt-1.5 text-sm leading-relaxed transition-opacity',
          muted && 'opacity-60',
          strike && 'line-through decoration-severity-critical/60',
        )}
      >
        {tokens.map((token, index) => (
          <span
            key={index}
            className={cn(
              token.type === 'added' && 'bg-diff-added-bg text-diff-added-fg rounded px-0.5',
              token.type === 'removed' && 'bg-diff-removed-bg text-diff-removed-fg rounded px-0.5',
            )}
          >
            {token.value}
          </span>
        ))}
      </p>
    </div>
  )
}

export { changeRatio }
