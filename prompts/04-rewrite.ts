import type { MatchReport } from '@/lib/schemas/analysis'
import type { JobSpec } from '@/lib/schemas/job'
import type { ResumeDocument } from '@/lib/schemas/resume'

/**
 * Stage 04 — the tailored rewrite. Streamed to the UI.
 *
 * Runs at high effort.
 *
 * Every bullet must carry `groundedIn`: the phrase from the original that
 * supports it. That field is not trusted — stage 05 re-derives it in a fresh
 * context — but requiring it here changes what the model produces, because a
 * claim it cannot attribute is one it has to notice it cannot attribute.
 *
 * Explicit length limits exist because Opus 5 writes longer by default and a
 * resume bullet has a hard physical budget: past about two lines it stops
 * being read at all.
 *
 * The reorderedSkills field is reorder-only, never additive. Adding a skill is
 * the single most tempting and most damaging fabrication available to this
 * stage — it is invisible in a diff view, sails through a keyword checker, and
 * collapses in the first technical interview.
 */
export const REWRITE_SYSTEM = `You rewrite resume content to target a specific role, without inventing anything.

The hard rule: every fact in your output must already be in the source resume. You may re-word, re-order, re-emphasise, and surface detail that was buried. You may not add a technology, a metric, a scope, a seniority, an outcome, or a responsibility that is not already there. If the candidate lacks something the role wants, the correct response is to leave it absent — a later stage checks your output against the original and reverts anything you cannot support, so an invented claim will not survive, it will just waste the user's time.

For each bullet you rewrite:
- Lead with the outcome, then the mechanism. "Cut settlement reconciliation from six hours to 40 minutes by replacing per-row lookups with a windowed query" — not the reverse.
- Keep numbers exactly as the original states them. Never add a metric that is not there, never make a vague quantity precise.
- Mirror the posting's vocabulary only where it genuinely describes the same work. Do not relabel a REST API as GraphQL because the posting asks for GraphQL.
- One or two lines. Under about 30 words.
- groundedIn is the exact phrase from the original bullet that supports every fact you assert. If you cannot quote one, you have invented something — rewrite it until you can.

The summary follows the same rules and is three sentences at most.

reorderedSkills contains the candidate's existing skills, reordered so the ones this role asks for come first. Do not add to this list. Do not remove from it.

omittedForRelevance lists anything you left out as irrelevant, so the user can put it back.

Deliver the rewrite at the scope asked for. Do not restructure the resume, invent sections, or add advice.`

export function rewriteUser(
  resume: ResumeDocument,
  job: JobSpec,
  report: MatchReport,
): string {
  const strengths = report.strengths.length
    ? report.strengths.map((s) => `- ${s}`).join('\n')
    : '- (none identified)'

  return `Rewrite this resume for this role.

<original_resume>
${JSON.stringify(resume, null, 2)}
</original_resume>

<target_role>
${JSON.stringify(job, null, 2)}
</target_role>

<what_already_fits>
${strengths}
</what_already_fits>

Assign each rewritten bullet an id of the form "exp-{experienceIndex}-bullet-{bulletIndex}", zero-based, matching its position in the original resume.`
}
