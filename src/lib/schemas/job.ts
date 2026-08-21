import { z } from 'zod'

/** Seniority ladder. `unspecified` exists because many postings genuinely omit it. */
export const seniorityLevels = [
  'internship',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
  'unspecified',
] as const

export const seniuoritySchema = z.enum(seniorityLevels)
export type Seniority = (typeof seniorityLevels)[number]

export const requirementSchema = z.object({
  skill: z.string().describe('The skill or qualification, normalised to its common name.'),
  /**
   * Split required from preferred because conflating them is how a tool ends
   * up telling someone they are unqualified over a nice-to-have.
   */
  necessity: z
    .enum(['required', 'preferred'])
    .describe('Required if the posting treats it as a hard requirement, otherwise preferred.'),
  evidence: z
    .string()
    .describe('The phrase from the posting that establishes this, quoted verbatim.'),
})

export const jobSpecSchema = z.object({
  title: z.string(),
  company: z.string().describe('Empty string if the posting does not name one.'),
  location: z.string().describe('Empty string if not stated.'),
  employmentType: z
    .string()
    .describe('e.g. "full-time", "contract". Empty string if not stated.'),
  remotePolicy: z
    .enum(['onsite', 'hybrid', 'remote', 'unspecified'])
    .describe('Only what the posting states. Do not infer from the location.'),
  seniority: seniuoritySchema,
  minYearsExperience: z
    .number()
    .describe('Explicit minimum years, or 0 when the posting does not state one.'),
  requirements: z.array(requirementSchema),
  responsibilities: z.array(z.string()),
  /**
   * Kept separate from requirements so the ATS pass can weight the words a
   * screener actually greps for, without treating boilerplate as a gap.
   */
  keywords: z
    .array(z.string())
    .describe('Distinctive terms a resume screener would match on. Exclude generic filler.'),
})

export type Requirement = z.infer<typeof requirementSchema>
export type JobSpec = z.infer<typeof jobSpecSchema>

export function requiredSkills(spec: JobSpec): string[] {
  return spec.requirements.filter((r) => r.necessity === 'required').map((r) => r.skill)
}

export function preferredSkills(spec: JobSpec): string[] {
  return spec.requirements.filter((r) => r.necessity === 'preferred').map((r) => r.skill)
}

const SENIORITY_RANK: Record<Seniority, number> = {
  internship: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  staff: 4,
  manager: 4,
  principal: 5,
  unspecified: -1,
}

export function seniorityRank(level: Seniority): number {
  return SENIORITY_RANK[level]
}
