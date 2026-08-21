import { z } from 'zod'

import { resumeDocumentSchema } from '@/lib/schemas/resume'

/**
 * Rewrite output and the grounding check that gates it.
 *
 * The critique stage is the product's central claim expressed as code: every
 * rewritten claim is checked against the source resume, and anything that
 * cannot be traced back to something the candidate actually wrote is reverted
 * before the user sees it.
 */

export const rewrittenBulletSchema = z.object({
  /** Stable id so the UI can accept or reject this one change. */
  id: z.string().describe('Short unique id, e.g. "exp-0-bullet-2".'),
  original: z.string().describe('The bullet exactly as it appeared in the source resume.'),
  rewritten: z.string().describe('The tailored version.'),
  rationale: z.string().describe('One short sentence on why this wording fits the role better.'),
  /**
   * The model's own claim about grounding. Never trusted on its own — the
   * critique pass re-derives it in a separate call with a separate context.
   */
  groundedIn: z
    .string()
    .describe('The exact phrase from the original bullet that supports every fact asserted.'),
})

export const tailoredResumeSchema = z.object({
  summary: z.string().describe('Rewritten professional summary, targeted at this role.'),
  summaryGroundedIn: z
    .string()
    .describe('The phrase from the original resume supporting the summary.'),
  bullets: z.array(rewrittenBulletSchema),
  reorderedSkills: z
    .array(z.string())
    .describe(
      'The candidate’s existing skills, reordered so the ones this role asks for come first. Never add a skill that is not already present.',
    ),
  omittedForRelevance: z
    .array(z.string())
    .describe('Anything dropped as irrelevant to this role, so the user can put it back.'),
})

export type RewrittenBullet = z.infer<typeof rewrittenBulletSchema>
export type TailoredResumeDraft = z.infer<typeof tailoredResumeSchema>

/* ------------------------------------------------------------- critique --- */

export const claimVerdictSchema = z.object({
  claimId: z.string().describe('The id of the bullet being judged, or "summary".'),
  claim: z.string().describe('The rewritten text under review.'),
  grounded: z
    .boolean()
    .describe(
      'True only if every fact — technologies, numbers, scope, seniority, outcomes — appears in or follows directly from the source resume.',
    ),
  sourceSpan: z
    .string()
    .describe('The verbatim source text that grounds it, or an empty string when not grounded.'),
  reason: z
    .string()
    .describe('When not grounded, name the specific fabricated or inflated detail.'),
})

export const critiqueReportSchema = z.object({
  verdicts: z.array(claimVerdictSchema),
  /** Surfaced verbatim in the UI, so it is written for the user, not for logs. */
  summary: z
    .string()
    .describe('One sentence on what was removed and why. Say "nothing was removed" when so.'),
})

export type ClaimVerdict = z.infer<typeof claimVerdictSchema>
export type CritiqueReport = z.infer<typeof critiqueReportSchema>

/* ------------------------------------------------------------ diff view --- */

export const diffSegmentSchema = z.object({
  id: z.string(),
  kind: z.enum(['summary', 'bullet', 'skills']),
  label: z.string().describe('Where this change sits, e.g. "Northwind Payments · bullet 2".'),
  original: z.string(),
  tailored: z.string(),
  rationale: z.string(),
  /** False when the critique pass rejected it; the UI shows why. */
  accepted: z.boolean(),
  rejectedReason: z.string(),
})

export type DiffSegment = z.infer<typeof diffSegmentSchema>

export const finalTailoredSchema = z.object({
  document: resumeDocumentSchema,
  diff: z.array(diffSegmentSchema),
  critique: critiqueReportSchema,
})

export type FinalTailored = z.infer<typeof finalTailoredSchema>
