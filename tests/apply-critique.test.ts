// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { applyCritique, buildCacheKey } from '@/server/pipeline/analyze'
import { emptyResumeDocument, type ResumeDocument } from '@/lib/schemas/resume'
import type { CritiqueReport, TailoredResumeDraft } from '@/lib/schemas/tailored'

function resume(): ResumeDocument {
  return {
    ...emptyResumeDocument(),
    summary: 'Backend engineer with four years on payment services.',
    skills: ['Go', 'PostgreSQL', 'Node.js'],
    experience: [
      {
        company: 'Northwind Payments',
        title: 'Backend Engineer',
        start: '2023',
        end: 'present',
        location: '',
        bullets: [
          'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.',
          'Contributed to the payouts API idempotency layer.',
        ],
      },
    ],
  }
}

function draft(): TailoredResumeDraft {
  return {
    summary: 'Backend engineer specialising in ledger and settlement systems.',
    summaryGroundedIn: 'payment services',
    bullets: [
      {
        id: 'exp-0-bullet-0',
        original: 'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.',
        rewritten: 'Cut settlement reconciliation from six hours to 40 minutes.',
        rationale: 'Leads with the outcome.',
        groundedIn: 'cutting a six-hour batch to 40 minutes',
      },
      {
        id: 'exp-0-bullet-1',
        original: 'Contributed to the payouts API idempotency layer.',
        // Inflated: "contributed to" became "architected", and a metric appeared.
        rewritten: 'Architected the payouts idempotency layer, eliminating 100% of duplicates.',
        rationale: 'Stronger verb.',
        groundedIn: 'payouts API idempotency layer',
      },
    ],
    reorderedSkills: ['Go', 'PostgreSQL', 'Node.js'],
    omittedForRelevance: [],
  }
}

function critique(overrides: Partial<Record<string, boolean>> = {}): CritiqueReport {
  const grounded = (id: string, fallback: boolean) => overrides[id] ?? fallback

  return {
    verdicts: [
      {
        claimId: 'summary',
        claim: draft().summary,
        grounded: grounded('summary', true),
        sourceSpan: 'payment services',
        reason: '',
      },
      {
        claimId: 'exp-0-bullet-0',
        claim: draft().bullets[0]!.rewritten,
        grounded: grounded('exp-0-bullet-0', true),
        sourceSpan: 'cutting a six-hour batch to 40 minutes',
        reason: '',
      },
      {
        claimId: 'exp-0-bullet-1',
        claim: draft().bullets[1]!.rewritten,
        grounded: grounded('exp-0-bullet-1', false),
        sourceSpan: '',
        reason: 'Upgrades "contributed to" to "architected" and adds a 100% metric not in the source.',
      },
    ],
    summary: 'Removed one claim that overstated ownership and invented a metric.',
  }
}

describe('applyCritique', () => {
  it('applies a grounded bullet', () => {
    const { document } = applyCritique(resume(), draft(), critique())
    expect(document.experience[0]!.bullets[0]).toBe(
      'Cut settlement reconciliation from six hours to 40 minutes.',
    )
  })

  it('reverts an ungrounded bullet to the original text', () => {
    // The whole product in one assertion: the inflated claim never reaches the
    // user's resume.
    const { document } = applyCritique(resume(), draft(), critique())
    expect(document.experience[0]!.bullets[1]).toBe(
      'Contributed to the payouts API idempotency layer.',
    )
  })

  it('surfaces why a claim was rejected rather than silently dropping it', () => {
    const { diff } = applyCritique(resume(), draft(), critique())
    const rejected = diff.find((segment) => segment.id === 'exp-0-bullet-1')!

    expect(rejected.accepted).toBe(false)
    expect(rejected.rejectedReason).toContain('architected')
  })

  it('treats a missing verdict as rejected — silence is not approval', () => {
    const noVerdicts: CritiqueReport = { verdicts: [], summary: '' }
    const { document, rejectedCount } = applyCritique(resume(), draft(), noVerdicts)

    expect(document.summary).toBe(resume().summary)
    expect(document.experience[0]!.bullets).toEqual(resume().experience[0]!.bullets)
    expect(rejectedCount).toBe(3)
  })

  it('reverts the summary when the summary itself is ungrounded', () => {
    const { document } = applyCritique(resume(), draft(), critique({ summary: false }))
    expect(document.summary).toBe(resume().summary)
  })

  it('counts rejections accurately', () => {
    expect(applyCritique(resume(), draft(), critique()).rejectedCount).toBe(1)
    expect(
      applyCritique(resume(), draft(), critique({ 'exp-0-bullet-0': false })).rejectedCount,
    ).toBe(2)
  })

  it('emits one diff segment per claim including the summary', () => {
    const { diff } = applyCritique(resume(), draft(), critique())
    expect(diff).toHaveLength(3)
    expect(diff[0]!.kind).toBe('summary')
  })

  it('never mutates the input document', () => {
    const original = resume()
    const snapshot = JSON.parse(JSON.stringify(original))
    applyCritique(original, draft(), critique())
    expect(original).toEqual(snapshot)
  })

  it('ignores a bullet id that does not map to a real position', () => {
    const bogus: TailoredResumeDraft = {
      ...draft(),
      bullets: [
        {
          id: 'exp-99-bullet-0',
          original: 'nope',
          rewritten: 'also nope',
          rationale: '',
          groundedIn: '',
        },
      ],
    }

    const { document } = applyCritique(resume(), bogus, {
      verdicts: [
        { claimId: 'exp-99-bullet-0', claim: 'also nope', grounded: true, sourceSpan: 'x', reason: '' },
      ],
      summary: '',
    })

    expect(document.experience[0]!.bullets).toEqual(resume().experience[0]!.bullets)
  })
})

describe('buildCacheKey', () => {
  it('is stable across whitespace and case differences', () => {
    expect(buildCacheKey('Hello  World', 'Job')).toBe(buildCacheKey('hello world', 'job'))
  })

  it('changes when either input changes', () => {
    const base = buildCacheKey('resume', 'job')
    expect(buildCacheKey('resume2', 'job')).not.toBe(base)
    expect(buildCacheKey('resume', 'job2')).not.toBe(base)
  })

  it('produces a sha256 hex digest', () => {
    expect(buildCacheKey('a', 'b')).toMatch(/^[0-9a-f]{64}$/)
  })
})
