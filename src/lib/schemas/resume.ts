import { z } from 'zod'

/**
 * The structured resume.
 *
 * This is the boundary type for the whole application: it is what the
 * extraction stage produces, what the rewrite stage transforms, what the PDF
 * and DOCX exporters read, and what gets stored in ResumeVersion.structured.
 * One shape means the two exporters cannot drift apart.
 *
 * Constraints worth knowing when editing: Anthropic's structured outputs do
 * not support recursive schemas, numeric bounds, or string length bounds. The
 * SDK strips `.min()`/`.max()` from the schema it sends and enforces them
 * client-side instead, so they are still worth writing — they just are not
 * what stops the model, the shape is.
 */

export const contactSchema = z.object({
  name: z.string().describe('Full name exactly as written on the resume.'),
  email: z.string().describe('Email address, or an empty string if none is present.'),
  phone: z.string().describe('Phone number, or an empty string if none is present.'),
  location: z.string().describe('City and country, or an empty string if none is present.'),
  links: z
    .array(z.string())
    .describe('Portfolio, GitHub, or LinkedIn URLs. Empty array if none.'),
})

export const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  start: z.string().describe('Start date as written, e.g. "2023-02" or "Feb 2023".'),
  end: z.string().describe('End date as written, or "present" for a current role.'),
  location: z.string().describe('Empty string if not stated.'),
  bullets: z
    .array(z.string())
    .describe('Each achievement or responsibility, verbatim from the resume.'),
})

export const educationSchema = z.object({
  institution: z.string(),
  qualification: z.string().describe('Degree or certification name.'),
  year: z.string().describe('Completion year as written. Empty string if not stated.'),
  detail: z.string().describe('Grade, honours, or thesis. Empty string if not stated.'),
})

export const projectSchema = z.object({
  name: z.string(),
  description: z.string(),
  link: z.string().describe('URL, or empty string.'),
})

export const resumeDocumentSchema = z.object({
  contact: contactSchema,
  summary: z
    .string()
    .describe('The professional summary or personal statement. Empty string if absent.'),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(z.string()).describe('Individual skills, one per array entry.'),
  certifications: z.array(z.string()),
  projects: z.array(projectSchema),
})

export type Contact = z.infer<typeof contactSchema>
export type Experience = z.infer<typeof experienceSchema>
export type Education = z.infer<typeof educationSchema>
export type Project = z.infer<typeof projectSchema>
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>

/** An empty document, for the paste-fallback and for tests. */
export function emptyResumeDocument(): ResumeDocument {
  return {
    contact: { name: '', email: '', phone: '', location: '', links: [] },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
  }
}

/**
 * Every sentence the resume actually asserts, flattened.
 *
 * The critique stage compares each rewritten claim against this list. It is
 * deliberately generated from the structured document rather than the raw
 * text: raw text carries headers, page numbers, and hyphenation artefacts that
 * produce false "grounded" matches.
 */
export function resumeClaims(document: ResumeDocument): string[] {
  return [
    document.summary,
    ...document.experience.flatMap((role) => [
      `${role.title} at ${role.company} (${role.start} to ${role.end})`,
      ...role.bullets,
    ]),
    ...document.education.map(
      (entry) => `${entry.qualification}, ${entry.institution} ${entry.year} ${entry.detail}`,
    ),
    ...document.skills,
    ...document.certifications,
    ...document.projects.map((project) => `${project.name}: ${project.description}`),
  ]
    .map((claim) => claim.trim())
    .filter(Boolean)
}

/** Rough token estimate. Good enough for budgeting; not a substitute for count_tokens. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
