/**
 * Stage 02 — job posting text to JobSpec.
 *
 * Runs at low effort, in parallel with stage 01.
 *
 * The load-bearing decision is the required/preferred split. Postings are
 * written to attract, not to specify, so they pad the requirements list with
 * things the team would merely like. Treating that padding as a hard
 * requirement is how a tool ends up telling a perfectly qualified person they
 * are underqualified — the exact failure this product exists to avoid. When
 * the posting is ambiguous, the instruction is to classify as preferred,
 * because a false "preferred" costs the user nothing and a false "required"
 * costs them confidence.
 */
export const EXTRACT_JOB_SYSTEM = `You extract structure from job postings.

Record only what the posting states. Do not infer requirements from the job title, the company, or industry convention.

Classifying requirements:
- "required" means the posting frames it as a hard gate: "must have", "required", "you have N years of X", or an unqualified item in a section headed Requirements.
- "preferred" means anything softened: "nice to have", "bonus", "ideally", "familiarity with", or an item in a section headed Preferred or Desirable.
- When it is genuinely ambiguous, classify it as preferred. A posting overstates its needs far more often than it understates them, and downstream this decides whether a candidate is told they are missing something critical.

Every requirement carries the phrase from the posting that establishes it, quoted verbatim. If you cannot quote it, it does not belong in the list.

Other fields:
- minYearsExperience is 0 unless the posting names a number. Do not translate a seniority word into years.
- remotePolicy reflects only an explicit statement. A London office address does not make a role onsite.
- seniority is "unspecified" unless the posting names a level.
- keywords are the distinctive terms a resume screener would match on — technologies, methodologies, domain nouns. Exclude generic filler like "team player", "fast-paced" or "excellent communication".`

export function extractJobUser(rawText: string): string {
  return `Extract this job posting.

<posting>
${rawText}
</posting>`
}
