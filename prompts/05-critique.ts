import type { ResumeDocument } from '@/lib/schemas/resume'
import type { TailoredResumeDraft } from '@/lib/schemas/tailored'

/**
 * Stage 05 — the grounding gate.
 *
 * Runs at high effort. This is the stage the product's central claim rests on.
 *
 * The critical design property is what this call does *not* receive. It sees
 * the original resume and the proposed rewrite. It does not see stage 04's
 * system prompt, its reasoning, or its `groundedIn` self-assessment. A model
 * asked to write and then check in one context is grading its own homework
 * with its own justifications still in front of it, and will wave through the
 * inflation it just produced. Separate call, separate context, adversarial
 * framing — that is the whole mechanism.
 *
 * The verdict is per claim rather than a single pass/fail on the document.
 * One fabricated bullet should cost the user that bullet, not the entire
 * rewrite.
 *
 * If this stage fails twice, the pipeline shows the original resume rather
 * than an unverified rewrite. It fails closed.
 */
export const CRITIQUE_SYSTEM = `You check rewritten resume claims against a source resume and reject anything not supported by it.

Assume the rewrite is trying to slip something past you. Your job is to catch it.

For each claim, decide whether every fact it asserts appears in, or follows directly from, the source resume. Facts include technologies, numbers, timeframes, team sizes, scope, seniority, ownership, and outcomes.

Mark grounded false when the rewrite:
- names a technology, tool or method the source does not
- states a metric the source does not, or sharpens a vague one ("improved performance" becoming "cut latency 40%")
- upgrades ownership ("contributed to" becoming "led", "owned", "architected")
- upgrades scope ("a service" becoming "the platform", "a team" becoming "the org")
- asserts an outcome where the source only describes an activity
- implies seniority the source does not evidence

Mark grounded true when the rewrite only re-words, re-orders, or makes explicit something the source plainly states. Rephrasing is allowed. Emphasis is allowed. New facts are not.

When grounded is true, sourceSpan is the verbatim text from the source resume that supports it. When grounded is false, sourceSpan is an empty string and reason names the specific detail that was invented or inflated — not a general complaint.

Judge each claim on its own. Do not let a document that is mostly fine carry a bad claim through.

The summary is one sentence for the user, naming what was removed. If nothing was removed, say so.`

export function critiqueUser(
  original: ResumeDocument,
  draft: TailoredResumeDraft,
): string {
  const claims = [
    { claimId: 'summary', claim: draft.summary },
    ...draft.bullets.map((bullet) => ({ claimId: bullet.id, claim: bullet.rewritten })),
  ]

  return `Check these rewritten claims against the source resume.

<source_resume>
${JSON.stringify(original, null, 2)}
</source_resume>

<claims_to_check>
${JSON.stringify(claims, null, 2)}
</claims_to_check>

Return one verdict per claim, using the claimId given.`
}
