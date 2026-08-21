'use client'

import * as React from 'react'
import { AlertCircle, PenLine } from 'lucide-react'

import { RewriteDiff } from '@/components/analysis/rewrite-diff'
import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { INITIAL_TAILOR_STATE } from '@/lib/validation/analyze'
import { runTailorAction } from '@/server/actions/analyze-actions'

/**
 * The rewrite step, deliberately behind a second click.
 *
 * The score and the gaps are the honest part and arrive first. Rewriting is a
 * separate decision, and separating them means someone who reads "you are
 * missing three critical requirements" can act on that instead of being handed
 * a polished document that papers over it.
 */
export function TailorSection({
  resumeText,
  jobText,
  sourceType,
}: {
  resumeText: string
  jobText: string
  sourceType: string
}) {
  const [state, action, pending] = React.useActionState(runTailorAction, INITIAL_TAILOR_STATE)

  if (state.ok) {
    return (
      <div className="space-y-4">
        <RewriteDiff segments={state.diff} critique={state.critique} />
      </div>
    )
  }

  return (
    <section className="glass rounded-2xl p-5 sm:p-6" aria-labelledby="tailor-heading">
      <h2 id="tailor-heading" className="text-sm font-medium">
        Tailor this resume
      </h2>
      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        Reword and reorder what you have already written to match this role. Every claim is
        checked against your original — anything that cannot be traced back to it is reverted
        before you see it.
      </p>

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <form action={action} className="mt-5">
        <input type="hidden" name="resumeText" value={resumeText} />
        <input type="hidden" name="jobText" value={jobText} />
        <input type="hidden" name="sourceType" value={sourceType} />

        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          <PenLine aria-hidden="true" />
          {pending ? 'Rewriting…' : 'Write a tailored version'}
        </Button>
      </form>

      {pending ? <TailorSkeleton /> : null}
    </section>
  )
}

/** Shaped like the diff it precedes: a verdict bar, then paired columns. */
function TailorSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-busy="true" aria-label="Writing the tailored version">
      <div className="flex items-start gap-3">
        <Skeleton className="size-5 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      </div>

      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="border-border/60 space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
          </div>
        </div>
      ))}
    </div>
  )
}
