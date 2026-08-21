import 'dotenv/config'

import { randomBytes, createHash } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

import { PrismaClient } from '../src/generated/prisma/client'
import {
  AiOperation,
  AnalysisStatus,
  ApplicationStatus,
  JobSourceType,
  PlanTier,
  ResumeSourceType,
  UsageStatus,
  UserRole,
} from '../src/generated/prisma/enums'

/**
 * Seeds a demo account that looks like someone actually mid-search.
 *
 * An empty dashboard reads as broken, so this is not filler: the twelve
 * applications span every status, the scores span a believable range rather
 * than clustering high, and they are dated backwards across ten weeks so the
 * per-week chart has a real shape. Two of them are deliberately poor matches,
 * because a tool that claims honesty and only ever shows 80s is not credible.
 */

const DEMO_EMAIL = 'demo@rolefit.app'
const DEMO_PASSWORD = 'demo1234'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env first.')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * DAY)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/* ------------------------------------------------------------------ resume */

const RESUME_DOCUMENT = {
  contact: {
    name: 'Alex Mercer',
    email: 'alex.mercer@example.com',
    location: 'Manchester, UK',
    links: ['github.com/alexmercer', 'linkedin.com/in/alexmercer'],
  },
  summary:
    'Backend engineer with four years building payment and ledger services in Node.js and Go. Comfortable owning a service end to end, from schema design through on-call.',
  experience: [
    {
      company: 'Northwind Payments',
      title: 'Backend Engineer',
      start: '2023-02',
      end: null,
      bullets: [
        'Rebuilt the settlement reconciliation job, cutting a nightly six-hour batch to 40 minutes by replacing per-row lookups with a single windowed query.',
        'Designed and shipped the idempotency layer for the payouts API, eliminating a class of duplicate-transfer incidents that had caused three P1s in the prior year.',
        'Introduced contract tests between the ledger and payouts services, catching 11 breaking changes before release in the first quarter.',
        'Carried the primary on-call pager for the payments domain on a six-week rotation.',
      ],
    },
    {
      company: 'Loomdata',
      title: 'Software Engineer',
      start: '2021-06',
      end: '2023-01',
      bullets: [
        'Built the ingestion pipeline for customer CSV uploads, handling 40M rows/day with backpressure and partial-failure recovery.',
        'Migrated the reporting service from a single Postgres instance to a read-replica topology, dropping p99 dashboard latency from 4.2s to 780ms.',
        'Mentored two junior engineers through their first production services.',
      ],
    },
  ],
  education: [
    {
      institution: 'University of Leeds',
      qualification: 'BSc Computer Science',
      year: '2021',
    },
  ],
  skills: [
    'Node.js',
    'TypeScript',
    'Go',
    'PostgreSQL',
    'Redis',
    'Docker',
    'AWS',
    'Terraform',
    'gRPC',
    'Kafka',
  ],
} as const

const RESUME_RAW_TEXT = [
  'Alex Mercer — Backend Engineer',
  'alex.mercer@example.com · Manchester, UK',
  '',
  RESUME_DOCUMENT.summary,
  '',
  'EXPERIENCE',
  ...RESUME_DOCUMENT.experience.flatMap((role) => [
    `${role.title}, ${role.company} (${role.start} – ${role.end ?? 'present'})`,
    ...role.bullets.map((bullet) => `  • ${bullet}`),
    '',
  ]),
  'SKILLS',
  RESUME_DOCUMENT.skills.join(', '),
].join('\n')

/* ------------------------------------------------------------ applications */

type SeedApplication = {
  company: string
  role: string
  location: string
  seniority: string
  status: ApplicationStatus
  score: number
  submittedDaysAgo: number
  respondedDaysAgo?: number
  notes?: string
  required: string[]
  missing: string[]
}

/**
 * Tuned against the real aggregates rather than written once and trusted.
 *
 * The first pass produced a 9/1/2 score distribution and a 64% response rate,
 * which makes the honesty pitch look like marketing: nobody hears back from
 * two thirds of their applications. Three things are deliberate here.
 *
 * Statuses lean towards APPLIED, because the common outcome of an application
 * is silence — the response rate lands near 45%, and only because a strong CV
 * is being modelled. Quillstream is ghosted outright: submitted, low score, no
 * reply ever, which is the single most familiar experience in a job search and
 * was missing entirely.
 *
 * Scores spread 38-88 across all three bands so the distribution chart has
 * something to show, and submission dates cluster unevenly so the per-week
 * bars have a shape instead of a flat run of ones.
 */
const APPLICATIONS: readonly SeedApplication[] = [
  {
    company: 'Ledgerline',
    role: 'Senior Backend Engineer',
    location: 'Remote (UK)',
    seniority: 'Senior',
    status: ApplicationStatus.OFFER,
    score: 88,
    submittedDaysAgo: 54,
    respondedDaysAgo: 47,
    notes: 'Offer received. Comp discussion scheduled — asked for range before accepting.',
    required: ['Go', 'PostgreSQL', 'distributed systems', 'payments'],
    missing: ['Kubernetes'],
  },
  {
    company: 'Quillstream',
    role: 'ML Platform Engineer',
    location: 'Remote',
    seniority: 'Senior',
    status: ApplicationStatus.APPLIED,
    score: 38,
    submittedDaysAgo: 49,
    notes: 'No reply, seven weeks. Critical gap on ML infrastructure — the score called it.',
    required: ['Python', 'PyTorch', 'ML pipelines', 'GPU scheduling'],
    missing: ['Python at depth', 'PyTorch', 'ML pipelines', 'GPU infrastructure'],
  },
  {
    company: 'Northgate Media',
    role: 'Staff Engineer',
    location: 'London',
    seniority: 'Staff',
    status: ApplicationStatus.REJECTED,
    score: 41,
    submittedDaysAgo: 47,
    respondedDaysAgo: 40,
    notes: 'Rejected at screen. Staff level was a reach with four years — the score said so.',
    required: ['10+ years', 'org-wide architecture', 'Go', 'team leadership'],
    missing: ['years of experience', 'staff-level scope', 'org-wide architecture'],
  },
  {
    company: 'Fenwick Logistics',
    role: 'Backend Engineer',
    location: 'Manchester',
    seniority: 'Mid',
    status: ApplicationStatus.REJECTED,
    score: 54,
    submittedDaysAgo: 40,
    respondedDaysAgo: 33,
    notes: 'Rejected after take-home. Feedback: solution worked but was under-tested.',
    required: ['Node.js', 'PostgreSQL', 'route optimisation'],
    missing: ['optimisation algorithms', 'geospatial indexing'],
  },
  {
    company: 'Palisade Insurance',
    role: 'Backend Engineer',
    location: 'Remote (UK)',
    seniority: 'Mid',
    status: ApplicationStatus.APPLIED,
    score: 62,
    submittedDaysAgo: 35,
    required: ['Node.js', 'AWS', 'SQL', 'insurance domain'],
    missing: ['insurance domain', 'actuarial data models'],
  },
  {
    company: 'Kestrel Retail',
    role: 'Senior Backend Engineer',
    location: 'Leeds, hybrid',
    seniority: 'Senior',
    status: ApplicationStatus.APPLIED,
    score: 76,
    submittedDaysAgo: 33,
    required: ['Java', 'Spring', 'PostgreSQL', 'microservices'],
    missing: ['Java', 'Spring Boot'],
  },
  {
    company: 'Orrery Systems',
    role: 'Infrastructure Engineer',
    location: 'Remote',
    seniority: 'Mid',
    status: ApplicationStatus.APPLIED,
    score: 58,
    submittedDaysAgo: 26,
    notes: 'Stretch application. Infra-heavy and my Kubernetes exposure is thin.',
    required: ['Kubernetes', 'Terraform', 'Prometheus', 'Go'],
    missing: ['Kubernetes at scale', 'Prometheus', 'service mesh'],
  },
  {
    company: 'Hartwell Financial',
    role: 'Platform Engineer',
    location: 'London, hybrid',
    seniority: 'Mid',
    status: ApplicationStatus.INTERVIEWING,
    score: 79,
    submittedDaysAgo: 21,
    respondedDaysAgo: 14,
    notes: 'System design round on Thursday. They care a lot about the reconciliation work.',
    required: ['Node.js', 'AWS', 'Terraform', 'CI/CD'],
    missing: ['Kubernetes', 'Datadog'],
  },
  {
    company: 'Corvid Health',
    role: 'Backend Engineer',
    location: 'Remote (EU)',
    seniority: 'Mid',
    status: ApplicationStatus.INTERVIEWING,
    score: 74,
    submittedDaysAgo: 19,
    respondedDaysAgo: 12,
    notes: 'Take-home submitted. Healthcare domain is new — flagged as a gap and it came up.',
    required: ['TypeScript', 'PostgreSQL', 'HL7/FHIR', 'event-driven'],
    missing: ['HL7/FHIR', 'healthcare compliance'],
  },
  {
    company: 'Bellweather Labs',
    role: 'Backend Engineer',
    location: 'Remote (UK)',
    seniority: 'Mid',
    status: ApplicationStatus.APPLIED,
    score: 82,
    submittedDaysAgo: 14,
    required: ['Node.js', 'TypeScript', 'PostgreSQL', 'REST APIs'],
    missing: ['GraphQL'],
  },
  {
    company: 'Vantage Grid',
    role: 'Senior Software Engineer',
    location: 'Manchester',
    seniority: 'Senior',
    status: ApplicationStatus.APPLIED,
    score: 63,
    submittedDaysAgo: 12,
    notes: 'They want evidence of leading projects, not just shipping them. Fair.',
    required: ['Go', 'Kafka', 'team leadership', 'observability'],
    missing: ['formal tech-lead experience', 'Kafka in production'],
  },
  {
    company: 'Ashgrove Bank',
    role: 'Senior Backend Engineer',
    location: 'Remote (UK)',
    seniority: 'Senior',
    status: ApplicationStatus.DRAFT,
    score: 84,
    submittedDaysAgo: 1,
    notes: 'Tailored and ready. Sending Monday once the referral lands.',
    required: ['Go', 'PostgreSQL', 'payments', 'regulatory reporting'],
    missing: ['regulatory reporting'],
  },
]

/* ------------------------------------------------------------------ helpers */

function subScoresFor(overall: number) {
  // Jitter each dimension around the overall score so the breakdown looks
  // derived rather than uniform, then clamp to a believable range.
  const jitter = [9, -7, 12, -11, 4]
  const labels = [
    'hardSkills',
    'yearsOfExperience',
    'domainRelevance',
    'seniorityFit',
    'keywordCoverage',
  ] as const

  return Object.fromEntries(
    labels.map((label, index) => [
      label,
      {
        score: Math.max(12, Math.min(97, overall + jitter[index]!)),
        weight: [0.3, 0.2, 0.2, 0.15, 0.15][index],
        evidence: [
          index === 0
            ? 'Ledger and payouts work at Northwind Payments maps directly onto the required stack.'
            : 'Derived from the resume sections quoted in the full analysis.',
        ],
      },
    ]),
  )
}

function gapsFor(missing: readonly string[]) {
  return missing.map((requirement, index) => ({
    requirement,
    severity: index === 0 ? 'CRITICAL' : index === 1 ? 'IMPORTANT' : 'NICE_TO_HAVE',
    evidence: `"${requirement}" appears in the job description but not in the resume.`,
    suggestedAction:
      index === 0
        ? `Name the closest adjacent experience explicitly rather than claiming ${requirement} outright.`
        : `Add a short project or course covering ${requirement}, or reframe existing work that touches it.`,
  }))
}

function keywordsFor(required: readonly string[], missing: readonly string[]) {
  const missingSet = new Set(missing)
  return {
    present: required.filter((term) => !missingSet.has(term)),
    missing: [...missing],
    suggestions: missing.map((term) => ({
      term,
      placement: 'Skills section, only if you can defend it in an interview.',
    })),
  }
}

/* --------------------------------------------------------------------- main */

async function main() {
  console.log('Seeding RoleFit demo data…')

  // Idempotent: wipe the demo user's tree, leave any other account alone.
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } })
    console.log('  cleared previous demo account')
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Alex Mercer',
      emailVerified: daysAgo(90),
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: UserRole.USER,
      plan: PlanTier.FREE,
      createdAt: daysAgo(90),
    },
  })

  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: 'Backend Engineer CV',
      isDefault: true,
      createdAt: daysAgo(88),
    },
  })

  const resumeVersion = await prisma.resumeVersion.create({
    data: {
      resumeId: resume.id,
      versionNumber: 1,
      sourceType: ResumeSourceType.UPLOAD_PDF,
      originalName: 'alex-mercer-cv.pdf',
      rawText: RESUME_RAW_TEXT,
      structured: RESUME_DOCUMENT,
      charCount: RESUME_RAW_TEXT.length,
      tokenEstimate: Math.round(RESUME_RAW_TEXT.length / 4),
      createdAt: daysAgo(88),
    },
  })

  let applicationCount = 0

  for (const app of APPLICATIONS) {
    const createdAt = daysAgo(app.submittedDaysAgo)

    const jobSpec = {
      title: app.role,
      company: app.company,
      location: app.location,
      seniority: app.seniority,
      requiredSkills: app.required,
      preferredSkills: ['CI/CD', 'code review', 'mentoring'],
      responsibilities: [
        `Own and operate ${app.company} backend services in production.`,
        'Collaborate with product on scoping and delivery.',
        'Participate in an on-call rotation.',
      ],
    }

    const rawJobText = [
      `${app.role} — ${app.company}`,
      app.location,
      '',
      'Requirements:',
      ...app.required.map((requirement) => `  - ${requirement}`),
    ].join('\n')

    const jobDescription = await prisma.jobDescription.create({
      data: {
        userId: user.id,
        sourceType: JobSourceType.PASTE,
        rawText: rawJobText,
        structured: jobSpec,
        contentHash: sha256(rawJobText),
        createdAt,
      },
    })

    const analysis = await prisma.analysis.create({
      data: {
        userId: user.id,
        resumeVersionId: resumeVersion.id,
        jobDescriptionId: jobDescription.id,
        resumeSnapshot: RESUME_DOCUMENT,
        jobSnapshot: jobSpec,
        status: AnalysisStatus.COMPLETE,
        overallScore: app.score,
        subScores: subScoresFor(app.score),
        gaps: gapsFor(app.missing),
        keywords: keywordsFor(app.required, app.missing),
        modelId: 'claude-opus-5',
        promptVersion: 'v1',
        cacheKey: sha256(`${resumeVersion.id}:${jobDescription.id}:v1:claude-opus-5`),
        demoMode: true,
        startedAt: createdAt,
        completedAt: new Date(createdAt.getTime() + 42_000),
      },
    })

    await prisma.application.create({
      data: {
        userId: user.id,
        analysisId: analysis.id,
        company: app.company,
        roleTitle: app.role,
        location: app.location,
        status: app.status,
        notes: app.notes ?? null,
        matchScoreSnapshot: app.score,
        appliedAt: app.status === ApplicationStatus.DRAFT ? null : createdAt,
        respondedAt: app.respondedDaysAgo ? daysAgo(app.respondedDaysAgo) : null,
        createdAt,
        updatedAt: app.respondedDaysAgo ? daysAgo(app.respondedDaysAgo) : createdAt,
      },
    })

    // One usage row per pipeline stage, priced at published Opus 5 rates
    // ($5/MTok in, $25/MTok out) so the admin view shows real arithmetic.
    const stages: ReadonlyArray<[AiOperation, number, number]> = [
      [AiOperation.EXTRACT_RESUME, 1_480, 1_120],
      [AiOperation.EXTRACT_JOB, 1_190, 760],
      [AiOperation.SCORE_AND_GAPS, 3_420, 2_480],
      [AiOperation.REWRITE, 3_510, 1_960],
      [AiOperation.CRITIQUE, 4_870, 1_140],
    ]

    for (const [operation, inputTokens, outputTokens] of stages) {
      const cacheReadTokens = Math.round(inputTokens * 0.55)
      const freshInput = inputTokens - cacheReadTokens
      const costUsd =
        (freshInput / 1_000_000) * 5 +
        (cacheReadTokens / 1_000_000) * 0.5 +
        (outputTokens / 1_000_000) * 25

      await prisma.usageLog.create({
        data: {
          userId: user.id,
          analysisId: analysis.id,
          operation,
          modelId: 'claude-opus-5',
          promptVersion: 'v1',
          inputTokens: freshInput,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens: 0,
          estimatedCostUsd: costUsd.toFixed(6),
          latencyMs: 2_400 + Math.round(Math.random() * 5_600),
          status: UsageStatus.OK,
          createdAt,
        },
      })
    }

    applicationCount += 1
  }

  const cacheKey = sha256(randomBytes(8).toString('hex'))
  await prisma.analysisCache.create({
    data: {
      key: cacheKey,
      payload: { note: 'Warm cache entry so the cache-hit path is exercised on first run.' },
      modelId: 'claude-opus-5',
      promptVersion: 'v1',
      hitCount: 3,
      expiresAt: new Date(now + 30 * DAY),
    },
  })

  const stats = await prisma.application.groupBy({
    by: ['status'],
    where: { userId: user.id },
    _count: true,
  })

  console.log(`\n  demo account : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
  console.log(`  applications : ${applicationCount}`)
  for (const row of stats) {
    console.log(`    ${row.status.padEnd(13)} ${row._count}`)
  }
  console.log('\nDone.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
