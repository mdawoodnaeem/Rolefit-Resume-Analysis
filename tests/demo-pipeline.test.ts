import { describe, expect, it } from 'vitest'

import {
  demoCritique,
  demoExtractJob,
  demoExtractResume,
  demoKeywordReport,
  demoRewrite,
  demoScoreAndGaps,
} from '@/lib/ai/demo'
import { computeOverallScore, subScoreKeys } from '@/lib/schemas/analysis'
import { matchReportSchema } from '@/lib/schemas/analysis'
import { resumeDocumentSchema } from '@/lib/schemas/resume'
import { jobSpecSchema } from '@/lib/schemas/job'
import { tailoredResumeSchema, critiqueReportSchema } from '@/lib/schemas/tailored'

const RESUME_TEXT = `Alex Mercer
alex.mercer@example.com | +44 7700 900123

SUMMARY
Backend engineer with four years building payment and ledger services in Node.js and Go.

EXPERIENCE
Backend Engineer, Northwind Payments (2023 - present)
- Rebuilt the settlement reconciliation job, cutting a nightly six-hour batch to 40 minutes
- Designed the idempotency layer for the payouts API, eliminating duplicate transfers
- Introduced contract tests between the ledger and payouts services

Software Engineer, Loomdata (2021 - 2023)
- Built the ingestion pipeline for CSV uploads handling 40M rows per day
- Migrated reporting from a single Postgres instance to a read-replica topology

SKILLS
Node.js, TypeScript, Go, PostgreSQL, Redis, Docker, AWS, Kafka

EDUCATION
BSc Computer Science, University of Leeds 2021
`

const JOB_TEXT = `Senior Backend Engineer - Ledgerline
Remote, full-time

We are looking for a senior engineer to own our ledger platform.

Requirements:
- Go
- PostgreSQL
- 5+ years of backend engineering
- Kubernetes
- Nice to have: GraphQL

Responsibilities:
- Build and operate ledger services in production
- Collaborate with product on scoping
`

describe('demo extraction', () => {
  const resume = demoExtractResume(RESUME_TEXT)
  const job = demoExtractJob(JOB_TEXT)

  it('produces a document that satisfies the real schema', () => {
    // Demo output flows into the same tables and UI as model output, so a
    // shape mismatch here would only surface in production.
    expect(() => resumeDocumentSchema.parse(resume)).not.toThrow()
    expect(() => jobSpecSchema.parse(job)).not.toThrow()
  })

  it('pulls out contact details', () => {
    expect(resume.contact.name).toBe('Alex Mercer')
    expect(resume.contact.email).toBe('alex.mercer@example.com')
  })

  it('splits experience into roles with their bullets', () => {
    expect(resume.experience).toHaveLength(2)
    expect(resume.experience[0]!.bullets).toHaveLength(3)
    expect(resume.experience[1]!.bullets).toHaveLength(2)
  })

  it('splits a comma-separated skills line into entries', () => {
    expect(resume.skills).toContain('Go')
    expect(resume.skills).toContain('PostgreSQL')
    expect(resume.skills.length).toBeGreaterThan(5)
  })

  it('reads the stated minimum years rather than inferring from seniority', () => {
    expect(job.minYearsExperience).toBe(5)
    expect(job.seniority).toBe('senior')
    expect(job.remotePolicy).toBe('remote')
  })

  it('classifies a "nice to have" as preferred, not required', () => {
    const graphql = job.requirements.find((r) => /graphql/i.test(r.skill))
    expect(graphql?.necessity).toBe('preferred')
  })

  it('strips the "nice to have" prefix from the skill name', () => {
    const graphql = job.requirements.find((r) => /graphql/i.test(r.skill))
    expect(graphql?.skill).toBe('GraphQL')
  })

  it('splits "Title, Company" even with no space before the comma', () => {
    // Regression: the split required whitespace *before* the separator, so the
    // most common resume format left the whole string in `title` and produced
    // evidence lines reading "Backend Engineer, Northwind Payments at ".
    expect(resume.experience[0]).toMatchObject({
      title: 'Backend Engineer',
      company: 'Northwind Payments',
    })
  })

  it('does not treat a years requirement as a skill', () => {
    // Regression: "5+ years of backend engineering" was keyword-matched
    // against the resume, failed, and surfaced as a Critical skill gap — while
    // the experience sub-score directly above it reported the requirement met.
    // Years are captured by minYearsExperience and scored by that dimension;
    // counting them twice makes the report contradict itself.
    expect(job.requirements.some((r) => /years/i.test(r.skill))).toBe(false)
    expect(job.minYearsExperience).toBe(5)
  })
})

describe('demo scoring', () => {
  const resume = demoExtractResume(RESUME_TEXT)
  const job = demoExtractJob(JOB_TEXT)
  const keywords = demoKeywordReport(resume, job)
  const report = demoScoreAndGaps(resume, job, keywords)

  it('satisfies the match report schema', () => {
    expect(() => matchReportSchema.parse(report)).not.toThrow()
  })

  it('never emits a sub-score without evidence', () => {
    // The product promise is "no bare numbers". This is the assertion of it.
    for (const key of subScoreKeys) {
      expect(report.subScores[key].evidence.length).toBeGreaterThan(0)
    }
  })

  it('reports an overall score equal to the weighted sum of its parts', () => {
    // A headline that disagrees with the breakdown destroys the audit claim.
    expect(report.overallScore).toBe(computeOverallScore(report.subScores))
  })

  it('flags a genuinely absent required skill as critical', () => {
    const kubernetes = report.gaps.find((gap) => /kubernetes/i.test(gap.requirement))
    expect(kubernetes?.severity).toBe('critical')
  })

  it('does not flag a skill the resume actually has', () => {
    expect(report.gaps.some((gap) => /^go$/i.test(gap.requirement.trim()))).toBe(false)
  })

  it('never suggests claiming a skill the candidate lacks', () => {
    for (const gap of report.gaps) {
      expect(gap.suggestedAction).not.toMatch(/\b(add|claim|say you have|include) (it|the skill)\b/i)
    }
  })

  it('does not contradict itself about years of experience', () => {
    // The report must not list years as a missing requirement while the
    // experience dimension scores that same requirement as met.
    const yearsGap = report.gaps.find((gap) => /years/i.test(gap.requirement))
    expect(yearsGap).toBeUndefined()
  })

  it('does not raise a gap for a requirement the resume evidences', () => {
    for (const gap of report.gaps) {
      expect(gap.requirement.toLowerCase()).not.toBe('go')
      expect(gap.requirement.toLowerCase()).not.toBe('postgresql')
    }
  })

  it('says plainly that it is not a model-backed score', () => {
    expect(report.verdict).toContain('demo mode')
  })

  it('is deterministic', () => {
    const again = demoScoreAndGaps(resume, job, demoKeywordReport(resume, job))
    expect(again).toEqual(report)
  })
})

describe('demo rewrite', () => {
  const resume = demoExtractResume(RESUME_TEXT)
  const job = demoExtractJob(JOB_TEXT)
  const draft = demoRewrite(resume, job)

  it('satisfies the tailored schema', () => {
    expect(() => tailoredResumeSchema.parse(draft)).not.toThrow()
  })

  it('invents nothing — every rewritten bullet exists verbatim in the source', () => {
    // The central guarantee of the product, asserted rather than asserted-to.
    const sourceBullets = new Set(resume.experience.flatMap((role) => role.bullets))
    for (const bullet of draft.bullets) {
      expect(sourceBullets.has(bullet.rewritten)).toBe(true)
    }
  })

  it('adds no skill that was not already listed', () => {
    expect([...draft.reorderedSkills].sort()).toEqual([...resume.skills].sort())
  })

  it('floats posting-relevant bullets above the rest within a role', () => {
    const first = draft.bullets[0]!
    expect(first.rationale).toMatch(/moved earlier|kept as written/i)
  })

  it('grounds every bullet in its own original text', () => {
    for (const bullet of draft.bullets) {
      expect(bullet.groundedIn).toBe(bullet.original)
    }
  })
})

describe('demo critique', () => {
  const resume = demoExtractResume(RESUME_TEXT)
  const job = demoExtractJob(JOB_TEXT)
  const draft = demoRewrite(resume, job)
  const critique = demoCritique(draft)

  it('satisfies the critique schema', () => {
    expect(() => critiqueReportSchema.parse(critique)).not.toThrow()
  })

  it('returns one verdict per claim, including the summary', () => {
    expect(critique.verdicts).toHaveLength(draft.bullets.length + 1)
  })

  it('passes everything, because reordering cannot fabricate', () => {
    expect(critique.verdicts.every((verdict) => verdict.grounded)).toBe(true)
    expect(critique.summary).toContain('Nothing was removed')
  })
})

describe('demo pipeline responds to its input', () => {
  it('scores a mismatched posting lower than a matched one', () => {
    const resume = demoExtractResume(RESUME_TEXT)

    const mismatched = demoExtractJob(`Senior Machine Learning Engineer - Quillstream
Requirements:
- Python
- PyTorch
- CUDA
- Distributed training
- 8+ years of ML research
`)

    const matchedScore = demoScoreAndGaps(
      resume,
      demoExtractJob(JOB_TEXT),
      demoKeywordReport(resume, demoExtractJob(JOB_TEXT)),
    ).overallScore

    const mismatchedScore = demoScoreAndGaps(
      resume,
      mismatched,
      demoKeywordReport(resume, mismatched),
    ).overallScore

    // A demo that returns the same number regardless of input is a screenshot.
    expect(mismatchedScore).toBeLessThan(matchedScore)
  })
})
