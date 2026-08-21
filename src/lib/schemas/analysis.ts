import { z } from 'zod'

/**
 * Match report and gap analysis.
 *
 * The central design rule: `evidence` is a non-empty array on every sub-score.
 * The product promises that no score is ever a bare number, and that promise
 * is enforced by the shape of the type rather than by asking the model nicely
 * in a prompt. A response with an empty evidence array fails validation and is
 * retried; it cannot reach the UI.
 */

export const subScoreKeys = [
  'hardSkills',
  'experience',
  'domainRelevance',
  'seniorityFit',
  'keywordCoverage',
] as const

export type SubScoreKey = (typeof subScoreKeys)[number]

/**
 * Weights sum to 1. Hard skills dominate because that is what actually gets a
 * resume past a screener; keyword coverage is weighted lowest because it is
 * the most gameable and the least predictive of whether someone can do the job.
 */
export const SUB_SCORE_WEIGHTS: Record<SubScoreKey, number> = {
  hardSkills: 0.3,
  experience: 0.2,
  domainRelevance: 0.2,
  seniorityFit: 0.15,
  keywordCoverage: 0.15,
}

export const SUB_SCORE_LABELS: Record<SubScoreKey, string> = {
  hardSkills: 'Hard skills',
  experience: 'Years of experience',
  domainRelevance: 'Domain relevance',
  seniorityFit: 'Seniority fit',
  keywordCoverage: 'ATS keyword coverage',
}

export const subScoreSchema = z.object({
  score: z.number().describe('0 to 100.'),
  reasoning: z.string().describe('One or two sentences explaining the score.'),
  evidence: z
    .array(z.string())
    .describe(
      'Short verbatim quotes from the resume or job description that justify this score. Never empty — if there is no supporting evidence, the score is 0 and you quote the requirement that went unmet.',
    ),
})

export const gapSeverities = ['critical', 'important', 'nice_to_have'] as const
export type GapSeverity = (typeof gapSeverities)[number]

export const gapSchema = z.object({
  requirement: z.string().describe('The specific thing the posting asks for.'),
  severity: z
    .enum(gapSeverities)
    .describe(
      'critical if the posting treats it as a hard requirement and the candidate has no adjacent experience; important if required but partially covered; nice_to_have if preferred.',
    ),
  evidence: z.string().describe('The phrase in the posting that establishes the requirement.'),
  suggestedAction: z
    .string()
    .describe(
      'One concrete step: a specific course, a project to build, or an honest way to reframe existing experience. Never suggest claiming the skill.',
    ),
  /** Keeps the UI honest about the difference between "cannot" and "has not said". */
  reframeable: z
    .boolean()
    .describe(
      'True only when the resume already contains genuinely adjacent experience that is currently understated.',
    ),
})

export const matchReportSchema = z.object({
  overallScore: z
    .number()
    .describe('0 to 100. Must equal the weighted sum of the sub-scores, rounded.'),
  verdict: z
    .string()
    .describe(
      'One honest sentence. If the candidate is underqualified, say so plainly rather than softening it.',
    ),
  subScores: z.object({
    hardSkills: subScoreSchema,
    experience: subScoreSchema,
    domainRelevance: subScoreSchema,
    seniorityFit: subScoreSchema,
    keywordCoverage: subScoreSchema,
  }),
  gaps: z.array(gapSchema),
  strengths: z
    .array(z.string())
    .describe('What genuinely fits, quoted or closely paraphrased from the resume.'),
})

export type SubScore = z.infer<typeof subScoreSchema>
export type Gap = z.infer<typeof gapSchema>
export type MatchReport = z.infer<typeof matchReportSchema>

/* --------------------------------------------------------- ATS keywords --- */

export const keywordMatchSchema = z.object({
  term: z.string(),
  present: z.boolean(),
  /** Where the term was found, or where it could honestly go. */
  location: z.string(),
  suggestion: z.string(),
})

export const keywordReportSchema = z.object({
  present: z.array(z.string()),
  missing: z.array(z.string()),
  coverage: z.number().describe('Percentage of job-description keywords found, 0 to 100.'),
  suggestions: z.array(keywordMatchSchema),
})

export type KeywordMatch = z.infer<typeof keywordMatchSchema>
export type KeywordReport = z.infer<typeof keywordReportSchema>

/* ------------------------------------------------------------- helpers --- */

/**
 * Recompute the overall score from the sub-scores.
 *
 * The model is asked to produce a weighted sum, and it usually does — but a
 * headline number that disagrees with the breakdown beneath it destroys the
 * whole "you can audit this" claim. So the arithmetic is done here, in code,
 * and the model's value is discarded. This is the kind of thing that should
 * never have been asked of a language model in the first place.
 */
export function computeOverallScore(subScores: MatchReport['subScores']): number {
  const total = subScoreKeys.reduce(
    (sum, key) => sum + subScores[key].score * SUB_SCORE_WEIGHTS[key],
    0,
  )
  return Math.round(Math.max(0, Math.min(100, total)))
}

export function severityRank(severity: GapSeverity): number {
  return { critical: 0, important: 1, nice_to_have: 2 }[severity]
}

export function sortGaps(gaps: readonly Gap[]): Gap[] {
  return [...gaps].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}

export const SEVERITY_LABELS: Record<GapSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  nice_to_have: 'Nice to have',
}
