import type { KeywordReport } from '@/lib/schemas/analysis'

/**
 * ATS keyword coverage — deliberately no language model.
 *
 * This is set intersection over normalised strings. Handing it to a model
 * would make it slower, cost money, and — the real problem — make it
 * non-deterministic: the same resume and posting could score 71% and then 68%,
 * and the user would have no way to tell whether they had changed something or
 * the model had simply wobbled. Coverage is a number people act on, so it has
 * to be reproducible.
 *
 * Knowing where *not* to use AI is part of the design, not a shortcut.
 */

/**
 * Aliases that a screener treats as the same token but string equality does
 * not. Kept small and hand-curated: an aggressive alias table produces false
 * "present" matches, which is exactly the dishonesty this product exists to
 * avoid. When unsure, leave it out and let it read as missing.
 */
const ALIASES: ReadonlyArray<readonly string[]> = [
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['nodejs', 'node', 'nodejs'],
  ['postgresql', 'postgres', 'psql'],
  ['kubernetes', 'k8s'],
  ['continuous integration', 'ci', 'ci cd', 'cicd'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['user interface', 'ui'],
  ['user experience', 'ux'],
  ['representational state transfer', 'rest', 'restful'],
  ['graphql', 'gql'],
  ['infrastructure as code', 'iac'],
  ['test driven development', 'tdd'],
  ['object relational mapping', 'orm'],
  ['react', 'reactjs'],
  ['vue', 'vuejs'],
  ['angular', 'angularjs'],
  ['dotnet', 'net', 'asp net'],
  ['c sharp', 'csharp'],
  ['c plus plus', 'cpp'],
]

const ALIAS_LOOKUP = new Map<string, string>()
for (const group of ALIASES) {
  const canonical = group[0]!
  for (const variant of group) ALIAS_LOOKUP.set(variant, canonical)
}

/**
 * Words that carry no screening signal. Not a general English stop list —
 * these are the ones that show up inside job-description skill phrases and
 * would otherwise create spurious matches ("experience" appears in every
 * resume ever written).
 */
const NOISE = new Set([
  'a', 'an', 'and', 'the', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'at', 'by',
  'strong', 'excellent', 'good', 'solid', 'proven', 'demonstrated', 'working',
  'experience', 'knowledge', 'ability', 'skills', 'understanding', 'familiarity',
  'years', 'year', 'plus', 'etc', 'including', 'such', 'as', 'is', 'are', 'be',
])

/**
 * Singular technical nouns that happen to end in a plural-looking suffix.
 *
 * Without this the suffix rules below mangle them — "kubernetes" to
 * "kubernet", "redis" to "redi". Usually that is harmless, because both the
 * job description and the resume run through the same function and still
 * agree. It stops being harmless on collisions: "sass" stems to "sas", which
 * is then indistinguishable from "SAS", and the report claims a skill the
 * candidate never listed. A false "present" is the worst failure this module
 * has, so the list errs towards protecting anything ambiguous.
 */
const PROTECTED = new Set([
  'kubernetes', 'redis', 'jenkins', 'postgres', 'postgresql', 'rails', 'sass',
  'less', 'express', 'ios', 'macos', 'dns', 'cors', 'https', 'nats', 'aws',
  'prometheus', 'graphql', 'nextjs', 'nestjs', 'elasticsearch', 'kibana',
  'jest', 'cypress', 'redux', 'devops', 'analytics', 'kinesis', 'lambdas',
  'windows', 'series', 'business', 'access', 'process', 'progress', 'success',
])

/**
 * Suffix stripping, not a real stemmer.
 *
 * Porter over-stems technical tokens and then matches things it should not.
 * This handles only the plural and gerund cases that actually occur in
 * resumes, and skips anything in PROTECTED.
 */
export function stem(word: string): string {
  if (word.length <= 4 || PROTECTED.has(word)) return word

  for (const [suffix, minLength] of [
    ['ing', 6],
    ['ed', 5],
    ['es', 5],
    ['s', 4],
  ] as const) {
    if (word.length >= minLength && word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length)
      // Don't strip into a double consonant ("kiss" -> "kis").
      if (base.length >= 3) return base
    }
  }

  return word
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[+#]/g, (match) => (match === '+' ? ' plus' : ' sharp'))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalised, alias-resolved, noise-stripped, stemmed tokens. */
export function tokenize(text: string): string[] {
  const normalized = normalize(text)
  const canonical = ALIAS_LOOKUP.get(normalized)
  if (canonical) return canonical.split(' ').map(stem)

  return normalized
    .split(' ')
    .filter((word) => word.length > 0 && !NOISE.has(word))
    .map((word) => ALIAS_LOOKUP.get(word) ?? word)
    .map(stem)
}

/** Every contiguous run of up to `maxLength` tokens, as space-joined strings. */
function ngrams(tokens: readonly string[], maxLength: number): Set<string> {
  const grams = new Set<string>()
  for (let size = 1; size <= maxLength; size += 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      grams.add(tokens.slice(start, start + size).join(' '))
    }
  }
  return grams
}

export type KeywordHit = {
  term: string
  present: boolean
  /** Section of the resume the term was found in, when it was. */
  foundIn: string | null
}

export type ResumeSection = { name: string; text: string }

/**
 * Match job-description keywords against the resume.
 *
 * A term counts as present when every one of its meaningful tokens appears in
 * the resume — so "distributed systems" does not match a resume that only says
 * "systems", but does match one that says "distributed tracing for systems".
 * That is intentionally slightly generous on word order and strict on content.
 */
export function matchKeywords(
  jobKeywords: readonly string[],
  sections: readonly ResumeSection[],
): KeywordHit[] {
  const sectionGrams = sections.map((section) => ({
    name: section.name,
    tokens: new Set(tokenize(section.text)),
    grams: ngrams(tokenize(section.text), 3),
  }))

  const seen = new Set<string>()
  const hits: KeywordHit[] = []

  for (const rawTerm of jobKeywords) {
    const key = normalize(rawTerm)
    if (!key || seen.has(key)) continue
    seen.add(key)

    const termTokens = tokenize(rawTerm)
    if (termTokens.length === 0) continue

    const phrase = termTokens.join(' ')

    const match = sectionGrams.find(
      (section) =>
        section.grams.has(phrase) || termTokens.every((token) => section.tokens.has(token)),
    )

    hits.push({ term: rawTerm, present: Boolean(match), foundIn: match?.name ?? null })
  }

  return hits
}

/** Build the persisted report from raw hits. */
export function buildKeywordReport(hits: readonly KeywordHit[]): KeywordReport {
  const present = hits.filter((hit) => hit.present)
  const missing = hits.filter((hit) => !hit.present)

  return {
    present: present.map((hit) => hit.term),
    missing: missing.map((hit) => hit.term),
    coverage: hits.length === 0 ? 0 : Math.round((present.length / hits.length) * 100),
    suggestions: missing.map((hit) => ({
      term: hit.term,
      present: false,
      location: 'Skills',
      // Never "add this keyword" — that is the fabrication this product refuses.
      suggestion: `Only add "${hit.term}" if you can defend it in an interview. If you have adjacent experience, name that instead.`,
    })),
  }
}

/** Split a resume into named sections for "where was this found" reporting. */
export function resumeSections(document: {
  summary: string
  experience: ReadonlyArray<{ company: string; title: string; bullets: readonly string[] }>
  skills: readonly string[]
  education: ReadonlyArray<{ qualification: string; institution: string }>
  certifications: readonly string[]
  projects: ReadonlyArray<{ name: string; description: string }>
}): ResumeSection[] {
  return [
    { name: 'Summary', text: document.summary },
    { name: 'Skills', text: document.skills.join(' ') },
    {
      name: 'Experience',
      text: document.experience
        .map((role) => `${role.title} ${role.company} ${role.bullets.join(' ')}`)
        .join(' '),
    },
    {
      name: 'Education',
      text: document.education.map((e) => `${e.qualification} ${e.institution}`).join(' '),
    },
    { name: 'Certifications', text: document.certifications.join(' ') },
    {
      name: 'Projects',
      text: document.projects.map((p) => `${p.name} ${p.description}`).join(' '),
    },
  ].filter((section) => section.text.trim().length > 0)
}
