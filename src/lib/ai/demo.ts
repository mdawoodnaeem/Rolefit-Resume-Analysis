import { buildKeywordReport, matchKeywords, resumeSections } from '@/lib/ats/keyword-match'
import {
  SUB_SCORE_WEIGHTS,
  computeOverallScore,
  type Gap,
  type KeywordReport,
  type MatchReport,
} from '@/lib/schemas/analysis'
import { requiredSkills, seniorityRank, type JobSpec, type Seniority } from '@/lib/schemas/job'
import { emptyResumeDocument, type ResumeDocument } from '@/lib/schemas/resume'
import type { CritiqueReport, TailoredResumeDraft } from '@/lib/schemas/tailored'

/**
 * Demo mode.
 *
 * Not a canned response. Everything below is computed from whatever the user
 * actually pasted, using the same deterministic keyword matcher the real
 * pipeline uses. Paste a different job description and the score moves, the
 * gaps change, and the missing keywords are genuinely the ones missing.
 *
 * That matters for two reasons. A recruiter clicking through a portfolio
 * deployment should see the product work, not a screenshot with a play button.
 * And a fixed blob would quietly diverge from the real pipeline's output shape
 * the first time a schema changed, so the demo path would rot unnoticed.
 *
 * What it cannot do is judge. There is no model here, so it cannot tell that
 * "built a ledger service" is domain-relevant to a payments role. It scores on
 * overlap and structure, and it is honest about being an approximation.
 *
 * The one thing it shares with the real pipeline is the anti-fabrication
 * guarantee, and it holds it more strongly: the rewrite only ever reorders and
 * re-prefixes text that already exists, so there is nothing for the critique to
 * reject. It cannot invent because it has no generator.
 */

const DEMO_NOTICE =
  'Generated in demo mode — scored by keyword and structure overlap, without a language model.'

/* ------------------------------------------------------------- extraction */

const SECTION_PATTERNS: ReadonlyArray<[keyof ResumeDocument | 'ignore', RegExp]> = [
  ['summary', /^(professional\s+)?(summary|profile|objective|about)\b/i],
  ['experience', /^(work\s+|professional\s+|employment\s+)?(experience|history)\b/i],
  ['education', /^education\b/i],
  ['skills', /^(technical\s+)?(skills|competenc|technolog)/i],
  ['certifications', /^(certification|licen[cs]e)/i],
  ['projects', /^(projects|portfolio)\b/i],
]

function classifyHeading(line: string): keyof ResumeDocument | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 40) return null

  for (const [key, pattern] of SECTION_PATTERNS) {
    if (key !== 'ignore' && pattern.test(trimmed)) return key
  }
  return null
}

const BULLET = /^\s*[-•*·—]\s*/

/**
 * Heuristic resume parse.
 *
 * Line-based and unapologetically simple. It gets a clean, conventionally
 * formatted resume right and a two-column PDF wrong — which is exactly why the
 * real flow shows the user a parsed preview to correct before scoring.
 */
export function demoExtractResume(rawText: string): ResumeDocument {
  const document = emptyResumeDocument()
  const lines = rawText.split(/\r?\n/)

  let section: keyof ResumeDocument | null = null
  const summaryLines: string[] = []
  let current: ResumeDocument['experience'][number] | null = null

  const flush = () => {
    if (current && (current.company || current.title || current.bullets.length)) {
      document.experience.push(current)
    }
    current = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const heading = classifyHeading(trimmed)
    if (heading) {
      flush()
      section = heading
      continue
    }

    // The first contact-looking line seeds the header.
    if (!section) {
      const email = trimmed.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]
      if (email && !document.contact.email) document.contact.email = email

      const phone = trimmed.match(/\+?\d[\d\s().-]{7,}\d/)?.[0]
      if (phone && !document.contact.phone) document.contact.phone = phone.trim()

      if (!document.contact.name && !email && !phone && trimmed.length < 60) {
        document.contact.name = trimmed.replace(/\s*[—–|·].*$/, '').trim()
      }
      continue
    }

    switch (section) {
      case 'summary':
        summaryLines.push(trimmed)
        break

      case 'skills':
        document.skills.push(
          ...trimmed
            .replace(BULLET, '')
            .split(/[,;|·]/)
            .map((skill) => skill.trim())
            .filter(Boolean),
        )
        break

      case 'certifications':
        document.certifications.push(trimmed.replace(BULLET, ''))
        break

      case 'education':
        document.education.push({
          institution: trimmed.replace(BULLET, ''),
          qualification: '',
          year: trimmed.match(/\b(19|20)\d{2}\b/)?.[0] ?? '',
          detail: '',
        })
        break

      case 'projects':
        document.projects.push({
          name: trimmed.replace(BULLET, '').slice(0, 60),
          description: trimmed.replace(BULLET, ''),
          link: trimmed.match(/https?:\/\/\S+/)?.[0] ?? '',
        })
        break

      case 'experience': {
        if (BULLET.test(line)) {
          current ??= { company: '', title: '', start: '', end: '', location: '', bullets: [] }
          current.bullets.push(trimmed.replace(BULLET, ''))
        } else {
          flush()
          // "Title, Company (2021 – present)" and friends.
          const dates = trimmed.match(
            /\(?\s*([A-Za-z]{3,9}\s*\d{4}|\d{4}[-/]\d{2}|\d{4})\s*[–—-]\s*(present|current|[A-Za-z]{3,9}\s*\d{4}|\d{4}[-/]\d{2}|\d{4})\s*\)?/i,
          )
          const withoutDates = trimmed.replace(dates?.[0] ?? '', '').trim()
          // The separator may be punctuation with no space in front of it —
          // "Backend Engineer, Northwind Payments" is the overwhelmingly
          // common form, and requiring whitespace before the comma left the
          // whole string in `title` with an empty `company`.
          const [first, second] = withoutDates.split(/\s*[,·|]\s+|\s+(?:at|@)\s+/)

          current = {
            title: (first ?? withoutDates).trim(),
            company: (second ?? '').trim(),
            start: dates?.[1]?.trim() ?? '',
            end: dates?.[2]?.trim() ?? '',
            location: '',
            bullets: [],
          }
        }
        break
      }

      default:
        break
    }
  }

  flush()
  document.summary = summaryLines.join(' ')
  return document
}

const SENIORITY_WORDS: ReadonlyArray<[Seniority, RegExp]> = [
  ['principal', /\bprincipal\b/i],
  ['staff', /\bstaff\b/i],
  ['lead', /\b(lead|leadership)\b/i],
  ['manager', /\b(manager|head of)\b/i],
  ['senior', /\bsenior|sr\.?\b/i],
  ['junior', /\b(junior|jr\.?|graduate|entry[- ]level)\b/i],
  ['internship', /\b(intern|internship|placement)\b/i],
  ['mid', /\bmid[- ]?(level|weight)\b/i],
]

export function demoExtractJob(rawText: string): JobSpec {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim())
  const nonEmpty = lines.filter(Boolean)

  const title = nonEmpty[0]?.replace(/\s*[—–|·-]\s*.*$/, '').trim() ?? 'Untitled role'
  const companyMatch = nonEmpty[0]?.match(/[—–|·-]\s*(.+)$/)

  const seniority = SENIORITY_WORDS.find(([, pattern]) => pattern.test(rawText))?.[0] ?? 'unspecified'
  const years = Number(rawText.match(/(\d+)\+?\s*years?/i)?.[1] ?? 0)

  const bulletLines = nonEmpty.filter((line) => BULLET.test(line)).map((l) => l.replace(BULLET, ''))

  // Split requirements from responsibilities on the verb: a line starting with
  // an imperative verb describes the job, a line naming a technology gates it.
  const responsibilityVerb =
    /^(build|design|own|lead|collaborate|work|partner|drive|deliver|maintain|support|participate|contribute|mentor|develop)\b/i

  const requirementLines = bulletLines.filter((line) => !responsibilityVerb.test(line))
  const responsibilities = bulletLines.filter((line) => responsibilityVerb.test(line))

  const preferredMarker = /\b(nice to have|bonus|preferred|desirable|ideally|familiarity)\b/i

  /**
   * A "5+ years of backend engineering" line is not a skill.
   *
   * Left in the requirements list it gets keyword-matched against the resume,
   * fails (nobody writes that sentence in a resume), and surfaces as a
   * Critical gap advising the reader to "name the closest thing you have
   * actually done instead of claiming 5+ years of backend engineering" — which
   * is nonsense, and worse, directly contradicts the experience sub-score
   * sitting a few centimetres above it saying the requirement is met.
   *
   * Years requirements are already captured by minYearsExperience and scored
   * by the experience dimension. Counting them twice is how a tool ends up
   * disagreeing with itself in public.
   */
  const yearsRequirement = /^\s*\d+\s*\+?\s*years?\b|\b\d+\s*\+?\s*years?\s+(of|in|experience)\b/i

  return {
    title,
    company: companyMatch?.[1]?.trim() ?? '',
    location: rawText.match(/\b(remote|hybrid|on-?site)\b/i)?.[0] ?? '',
    employmentType: rawText.match(/\b(full-time|part-time|contract|permanent)\b/i)?.[0] ?? '',
    remotePolicy: /\bremote\b/i.test(rawText)
      ? 'remote'
      : /\bhybrid\b/i.test(rawText)
        ? 'hybrid'
        : /\bon-?site\b/i.test(rawText)
          ? 'onsite'
          : 'unspecified',
    seniority,
    minYearsExperience: Number.isFinite(years) ? years : 0,
    requirements: requirementLines
      .filter((line) => !yearsRequirement.test(line))
      .map((line) => ({
        skill: line
          .replace(/^(experience (with|in)|proficiency (with|in)|knowledge of)\s*/i, '')
          .replace(/^(nice to have|bonus|preferred|desirable|ideally)\s*:?\s*/i, '')
          .trim(),
        necessity: preferredMarker.test(line) ? ('preferred' as const) : ('required' as const),
        evidence: line,
      })),
    responsibilities,
    keywords: extractKeywords(rawText),
  }
}

/** Distinctive capitalised or technical-looking terms, deduplicated. */
function extractKeywords(text: string): string[] {
  const candidates = text.match(/\b[A-Z][A-Za-z0-9.+#]{1,}(?:\s[A-Z][A-Za-z0-9.+#]+)?\b/g) ?? []
  const stopWords = new Set([
    'The', 'We', 'You', 'Our', 'This', 'That', 'Requirements', 'Responsibilities',
    'About', 'Role', 'Team', 'Company', 'What', 'Who', 'Why', 'How', 'Your',
    'Experience', 'Skills', 'Preferred', 'Required', 'Nice', 'Bonus', 'Benefits',
  ])

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const candidate of candidates) {
    const term = candidate.trim()
    if (stopWords.has(term) || term.length < 2) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push(term)
  }

  return keywords.slice(0, 30)
}

/* ------------------------------------------------------------------ scoring */

function yearsOfExperience(resume: ResumeDocument): number {
  const years = resume.experience
    .map((role) => {
      const start = Number(role.start.match(/(19|20)\d{2}/)?.[0] ?? 0)
      const end = /present|current/i.test(role.end)
        ? new Date().getUTCFullYear()
        : Number(role.end.match(/(19|20)\d{2}/)?.[0] ?? 0)
      return start && end ? Math.max(0, end - start) : 0
    })
    .reduce((sum, n) => sum + n, 0)

  return years
}

function resumeSeniority(resume: ResumeDocument): Seniority {
  const titles = resume.experience.map((role) => role.title).join(' ')
  return SENIORITY_WORDS.find(([, pattern]) => pattern.test(titles))?.[0] ?? 'mid'
}

export function demoScoreAndGaps(
  resume: ResumeDocument,
  job: JobSpec,
  keywords: KeywordReport,
): MatchReport {
  const sections = resumeSections(resume)
  const required = requiredSkills(job)

  const requiredHits = matchKeywords(required, sections)
  const hardSkillsScore = required.length
    ? Math.round((requiredHits.filter((h) => h.present).length / required.length) * 100)
    : 60

  const years = yearsOfExperience(resume)
  const experienceScore = job.minYearsExperience
    ? Math.round(Math.max(0, Math.min(100, (years / job.minYearsExperience) * 100)))
    : Math.min(100, 40 + years * 8)

  const domainScore = Math.round(
    Math.min(100, keywords.coverage * 0.6 + (resume.experience.length ? 30 : 0)),
  )

  const gapRanks = seniorityRank(job.seniority) - seniorityRank(resumeSeniority(resume))
  const seniorityScore =
    job.seniority === 'unspecified' ? 70 : Math.round(Math.max(0, 100 - Math.abs(gapRanks) * 28))

  const subScores = {
    hardSkills: {
      score: hardSkillsScore,
      reasoning: `${requiredHits.filter((h) => h.present).length} of ${required.length || 'the'} required skills appear in the resume.`,
      evidence: requiredHits
        .filter((hit) => hit.present)
        .slice(0, 4)
        .map((hit) => `"${hit.term}" found in ${hit.foundIn}`)
        .concat(requiredHits.filter((h) => !h.present).slice(0, 2).map((h) => `"${h.term}" not found`)),
    },
    experience: {
      score: experienceScore,
      reasoning: job.minYearsExperience
        ? `About ${years} years evidenced against a stated minimum of ${job.minYearsExperience}.`
        : `About ${years} years evidenced; the posting states no minimum.`,
      evidence: resume.experience
        .slice(0, 3)
        .map((role) => `${role.title} at ${role.company} (${role.start}–${role.end})`),
    },
    domainRelevance: {
      score: domainScore,
      reasoning: `Derived from ${keywords.coverage}% keyword overlap across ${resume.experience.length} roles.`,
      evidence: keywords.present.slice(0, 5).map((term) => `Shared term: ${term}`),
    },
    seniorityFit: {
      score: seniorityScore,
      reasoning:
        job.seniority === 'unspecified'
          ? 'The posting does not state a level, so this is not penalised.'
          : `Posting is ${job.seniority}; resume reads as ${resumeSeniority(resume)}.`,
      evidence: [`Posting seniority: ${job.seniority}`, `Resume seniority: ${resumeSeniority(resume)}`],
    },
    keywordCoverage: {
      score: keywords.coverage,
      reasoning: `${keywords.present.length} of ${keywords.present.length + keywords.missing.length} screening terms present.`,
      evidence: keywords.present
        .slice(0, 4)
        .map((t) => `Present: ${t}`)
        .concat(keywords.missing.slice(0, 3).map((t) => `Missing: ${t}`)),
    },
  }

  // Every evidence array must be non-empty — the schema requires it and the
  // product promise depends on it, so backfill rather than emit a bare score.
  for (const key of Object.keys(subScores) as Array<keyof typeof subScores>) {
    if (subScores[key].evidence.length === 0) {
      subScores[key].evidence = ['No supporting detail found in the resume for this dimension.']
    }
  }

  const criticalGaps: Gap[] = requiredHits
    .filter((hit) => !hit.present)
    .map((hit) => ({
      requirement: hit.term,
      severity: 'critical',
      evidence: job.requirements.find((r) => r.skill === hit.term)?.evidence ?? hit.term,
      suggestedAction: `Name the closest thing you have actually done instead of claiming "${hit.term}". If you have nothing adjacent, this is a real gap worth closing before applying again.`,
      reframeable: false,
    }))

  const preferredGaps: Gap[] = job.requirements
    .filter((r) => r.necessity === 'preferred' && keywords.missing.includes(r.skill))
    .map((r) => ({
      requirement: r.skill,
      severity: 'nice_to_have',
      evidence: r.evidence,
      suggestedAction: `Preferred, not required — worth a line only if you have genuine exposure to ${r.skill}.`,
      reframeable: false,
    }))

  const gaps: Gap[] = [...criticalGaps, ...preferredGaps]

  const overallScore = computeOverallScore(subScores)

  return {
    overallScore,
    verdict:
      overallScore < 45
        ? `Weak match. ${gaps.filter((g) => g.severity === 'critical').length} required skills are absent from the resume entirely. ${DEMO_NOTICE}`
        : overallScore < 65
          ? `Partial match. The core is there but several requirements are unevidenced. ${DEMO_NOTICE}`
          : `Strong match on the evidence available. ${DEMO_NOTICE}`,
    subScores,
    gaps,
    strengths: keywords.present.slice(0, 5).map((term) => `Resume evidences ${term}.`),
  }
}

/* ------------------------------------------------------------------ rewrite */

/**
 * Reorders and re-prefixes. Never generates.
 *
 * Bullets whose text overlaps the posting's vocabulary float to the top of
 * their role, which is the single highest-value edit a screener notices. The
 * text itself is untouched, so this cannot fabricate — which is why the
 * critique below can pass everything without lying.
 */
export function demoRewrite(resume: ResumeDocument, job: JobSpec): TailoredResumeDraft {
  const jobTerms = new Set(job.keywords.map((k) => k.toLowerCase()))

  const relevance = (text: string): number =>
    [...jobTerms].filter((term) => text.toLowerCase().includes(term)).length

  const bullets = resume.experience.flatMap((role, roleIndex) =>
    role.bullets
      .map((bullet, bulletIndex) => ({ bullet, bulletIndex, score: relevance(bullet) }))
      .sort((a, b) => b.score - a.score)
      .map(({ bullet, bulletIndex, score }) => ({
        id: `exp-${roleIndex}-bullet-${bulletIndex}`,
        original: bullet,
        rewritten: bullet,
        rationale:
          score > 0
            ? `Moved earlier — mentions ${score} term${score === 1 ? '' : 's'} this posting asks for.`
            : 'Kept as written; no overlap with the posting to emphasise.',
        groundedIn: bullet,
      })),
  )

  const skills = [...resume.skills].sort(
    (a, b) => Number(jobTerms.has(b.toLowerCase())) - Number(jobTerms.has(a.toLowerCase())),
  )

  return {
    summary: resume.summary,
    summaryGroundedIn: resume.summary,
    bullets,
    reorderedSkills: skills,
    omittedForRelevance: [],
  }
}

export function demoCritique(draft: TailoredResumeDraft): CritiqueReport {
  return {
    verdicts: [
      {
        claimId: 'summary',
        claim: draft.summary,
        grounded: true,
        sourceSpan: draft.summary,
        reason: '',
      },
      ...draft.bullets.map((bullet) => ({
        claimId: bullet.id,
        claim: bullet.rewritten,
        grounded: true,
        sourceSpan: bullet.original,
        reason: '',
      })),
    ],
    summary:
      'Nothing was removed. Demo mode only reorders existing text, so there is nothing it could have invented.',
  }
}

export function demoKeywordReport(resume: ResumeDocument, job: JobSpec): KeywordReport {
  return buildKeywordReport(matchKeywords(job.keywords, resumeSections(resume)))
}

export { SUB_SCORE_WEIGHTS }
