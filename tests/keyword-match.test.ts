import { describe, expect, it } from 'vitest'

import {
  buildKeywordReport,
  matchKeywords,
  normalize,
  resumeSections,
  stem,
  tokenize,
  type ResumeSection,
} from '@/lib/ats/keyword-match'

const SECTIONS: ResumeSection[] = [
  { name: 'Summary', text: 'Backend engineer building payment services in Node.js and Go.' },
  { name: 'Skills', text: 'TypeScript, PostgreSQL, Docker, AWS, Kafka, Terraform' },
  {
    name: 'Experience',
    text: 'Rebuilt settlement reconciliation, cutting a nightly batch from six hours to 40 minutes. Designed an idempotency layer for the payouts API. Introduced contract tests between services.',
  },
]

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize('Node.js, TypeScript!')).toBe('node js typescript')
  })

  it('preserves the meaning of + and # rather than deleting them', () => {
    // "C++" and "C#" collapsing to a bare "c" would match almost any resume.
    expect(normalize('C++')).toBe('c plus plus')
    expect(normalize('C#')).toBe('c sharp')
  })

  it('collapses runs of whitespace', () => {
    expect(normalize('  Go    routines  ')).toBe('go routines')
  })
})

describe('stem', () => {
  it('strips plurals and gerunds', () => {
    expect(stem('services')).toBe('servic')
    expect(stem('building')).toBe('build')
  })

  it('leaves short words alone', () => {
    expect(stem('go')).toBe('go')
    expect(stem('java')).toBe('java')
  })

  it('does not over-stem technical nouns', () => {
    // A Porter stemmer turns these into 'kubernet' and 'redi', which then
    // match things they should not.
    expect(stem('kubernetes')).toBe('kubernetes')
    expect(stem('redis')).toBe('redis')
  })
})

describe('tokenize', () => {
  it('drops filler that appears in every resume', () => {
    expect(tokenize('strong experience with Kafka')).toEqual(['kafka'])
  })

  it('resolves aliases to a canonical form', () => {
    expect(tokenize('K8s')).toEqual(tokenize('Kubernetes'))
    expect(tokenize('Postgres')).toEqual(tokenize('PostgreSQL'))
    expect(tokenize('JS')).toEqual(tokenize('JavaScript'))
  })
})

describe('matchKeywords', () => {
  it('finds a term and reports which section it came from', () => {
    const [hit] = matchKeywords(['Kafka'], SECTIONS)
    expect(hit).toMatchObject({ term: 'Kafka', present: true, foundIn: 'Skills' })
  })

  it('matches through an alias', () => {
    const [hit] = matchKeywords(['Postgres'], SECTIONS)
    expect(hit!.present).toBe(true)
  })

  it('matches a multi-word term whose tokens are split across a sentence', () => {
    const [hit] = matchKeywords(['contract testing'], SECTIONS)
    expect(hit!.present).toBe(true)
  })

  it('reports a genuinely absent term as missing', () => {
    const [hit] = matchKeywords(['Kubernetes'], SECTIONS)
    expect(hit).toMatchObject({ present: false, foundIn: null })
  })

  it('does not match a compound on one of its words alone', () => {
    // The resume says "services" but never "distributed" — claiming a match
    // here is precisely the false positive that makes a coverage score a lie.
    const [hit] = matchKeywords(['distributed systems'], SECTIONS)
    expect(hit!.present).toBe(false)
  })

  it('deduplicates terms that normalise to the same thing', () => {
    const hits = matchKeywords(['Node.js', 'node js', 'NODE.JS'], SECTIONS)
    expect(hits).toHaveLength(1)
  })

  it('ignores terms that are entirely filler', () => {
    expect(matchKeywords(['strong experience'], SECTIONS)).toHaveLength(0)
  })

  it('is deterministic across repeated runs', () => {
    const terms = ['Kafka', 'Kubernetes', 'Go', 'Terraform', 'GraphQL']
    const first = matchKeywords(terms, SECTIONS)
    for (let i = 0; i < 5; i += 1) {
      expect(matchKeywords(terms, SECTIONS)).toEqual(first)
    }
  })
})

describe('buildKeywordReport', () => {
  it('computes coverage as a whole percentage', () => {
    const report = buildKeywordReport(
      matchKeywords(['Kafka', 'Terraform', 'Kubernetes', 'GraphQL'], SECTIONS),
    )

    expect(report.present).toEqual(['Kafka', 'Terraform'])
    expect(report.missing).toEqual(['Kubernetes', 'GraphQL'])
    expect(report.coverage).toBe(50)
  })

  it('returns zero coverage rather than NaN for an empty term list', () => {
    expect(buildKeywordReport([]).coverage).toBe(0)
  })

  it('never suggests simply adding the missing keyword', () => {
    const report = buildKeywordReport(matchKeywords(['Kubernetes'], SECTIONS))
    const suggestion = report.suggestions[0]!.suggestion

    expect(suggestion).toContain('defend it in an interview')
    expect(suggestion).not.toMatch(/^add /i)
  })
})

describe('resumeSections', () => {
  it('omits sections with no content so they cannot be reported as a match location', () => {
    const sections = resumeSections({
      summary: 'Backend engineer.',
      experience: [],
      skills: ['Go'],
      education: [],
      certifications: [],
      projects: [],
    })

    expect(sections.map((section) => section.name)).toEqual(['Summary', 'Skills'])
  })
})
