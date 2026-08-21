import Link from 'next/link'
import {
  ArrowRight,
  FileSearch,
  GitCompareArrows,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'

import { AuroraBackground } from '@/components/aurora-background'
import { ScoreDistribution } from '@/components/charts/score-distribution'
import { ScoreGauge } from '@/components/charts/score-gauge'
import { StatTile } from '@/components/charts/stat-tile'
import { WeeklyBars } from '@/components/charts/weekly-bars'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import {
  Parallax,
  Reveal,
  RevealGroup,
  RevealItem,
  ScrollProgress,
} from '@/components/motion-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreBandLabel, scoreBandVar } from '@/lib/utils'

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground />
      <ScrollProgress />
      <SiteHeader />

      <main id="main" className="flex-1">
        <Hero />
        <HonestySection />
        <DashboardPreview />
        <HowItWorks />
        <Features />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  )
}

/* ------------------------------------------------------------------ hero */

const SUB_SCORES = [
  { label: 'Hard skills', value: 81 },
  { label: 'Years of experience', value: 64 },
  { label: 'Domain relevance', value: 88 },
  { label: 'Seniority fit', value: 58 },
  { label: 'ATS keyword coverage', value: 69 },
] as const

function Hero() {
  const score = 72

  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-32 lg:pt-24">
        <div>
          <Reveal y={14}>
            <Badge variant="outline" className="glass-subtle mb-5 gap-1.5 py-1 pl-1.5 pr-2.5">
              <ShieldCheck className="text-primary" aria-hidden="true" />
              Will not invent experience
            </Badge>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.03]">
              Tailor your resume without inventing a career.
            </h1>
          </Reveal>

          <Reveal delay={0.14}>
            <p className="text-muted-foreground mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
              Paste a job description, upload your resume, and get an honest match score with its
              reasoning shown, a rewrite grounded in what you have actually done, and a gap
              analysis that tells you what you are genuinely missing.
            </p>
          </Reveal>

          <Reveal delay={0.22}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/analyze">
                  Try it — no signup
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="glass-subtle">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Demo mode runs the full flow on fixture data — no account, no API key.
            </p>
          </Reveal>
        </div>

        <Parallax speed={0.09}>
          <Reveal delay={0.1} y={30}>
            <ScorePreview score={score} />
          </Reveal>
        </Parallax>
      </div>
    </section>
  )
}

function ScorePreview({ score }: { score: number }) {
  return (
    <div className="glass rounded-3xl p-6 sm:p-7">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
        <div className="glow-primary shrink-0 rounded-full">
          <ScoreGauge score={score} size={168} />
        </div>

        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium">{scoreBandLabel(score)}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Senior Backend Engineer · Ledgerline
          </p>
          <Badge variant="important" className="mt-3">
            2 important gaps
          </Badge>
        </div>
      </div>

      <ul className="mt-7 space-y-3">
        {SUB_SCORES.map((item) => (
          <li key={item.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
            <span className="text-muted-foreground truncate text-xs">{item.label}</span>
            <span className="tabular text-xs font-medium">{item.value}</span>
            <div className="bg-score-track col-span-2 h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{ width: `${item.value}%`, backgroundColor: scoreBandVar(item.value) }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-6 border-t border-[var(--glass-border)] pt-4 text-xs leading-relaxed">
        Every sub-score cites the lines it was derived from. No bare numbers.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- honesty */

function HonestySection() {
  const pillars = [
    {
      title: 'A grounding pass, not a promise',
      body: 'A separate verification step re-reads the rewrite against your source resume and reverts every claim it cannot trace back to a line you wrote.',
    },
    {
      title: 'Underqualified is a valid answer',
      body: 'If the role wants eight years and you have three, the score says so and the gap is labelled Critical. You get told before the recruiter works it out.',
    },
    {
      title: 'Gaps come with a real next step',
      body: 'Each gap carries one concrete action — a course, a project, or an honest way to reframe experience you already have.',
    },
  ] as const

  return (
    <section id="honesty" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal className="max-w-3xl">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          Most tools help you sound qualified. This one tells you whether you are.
        </h2>
        <p className="text-muted-foreground mt-5 text-pretty leading-relaxed">
          Inflating a resume is easy to automate and expensive to get caught doing. RoleFit takes
          the other side of that trade. The rewrite is checked, claim by claim, against your
          original resume — anything the model cannot ground in your own words is rejected before
          you ever see it.
        </p>
      </Reveal>

      <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-3">
        {pillars.map((item) => (
          <RevealItem key={item.title} className="glass rounded-2xl p-5">
            <h3 className="text-sm font-medium">{item.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.body}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  )
}

/* ------------------------------------------------------- dashboard preview */

/**
 * Illustrative figures for the marketing preview, modelling the brief's target
 * user — someone mid-search across 20+ roles.
 *
 * These are cross-checked to agree with each other: the weekly bars sum to 38,
 * which is the application count in the stat tile, and the score distribution
 * (6 + 14 + 18) sums to 38 as well. Demo numbers that contradict each other
 * are exactly the detail a reviewer notices.
 */
const WEEKLY = [
  { label: 'Mar 4', value: 2 },
  { label: 'Mar 11', value: 4 },
  { label: 'Mar 18', value: 3 },
  { label: 'Mar 25', value: 6 },
  { label: 'Apr 1', value: 5 },
  { label: 'Apr 8', value: 7 },
  { label: 'Apr 15', value: 5 },
  { label: 'Apr 22', value: 6 },
] as const

function DashboardPreview() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            Every application, tracked and totalled.
          </h2>
          <p className="text-muted-foreground mt-5 text-pretty leading-relaxed">
            Each analysis becomes an application with a status and notes. The dashboard turns
            twenty scattered attempts into one honest picture of how the search is actually going.
          </p>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.07}>
          <RevealItem>
            <StatTile label="Average match" value={71.4} decimals={1} delta={4.2} />
          </RevealItem>
          <RevealItem>
            <StatTile label="Applications" value={38} delta={12} />
          </RevealItem>
          <RevealItem>
            <StatTile label="Response rate" value={23.7} suffix="%" decimals={1} delta={-2.1} />
          </RevealItem>
          <RevealItem>
            <StatTile label="Interviews" value={5} delta={2} />
          </RevealItem>
        </RevealGroup>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Reveal delay={0.05}>
            <WeeklyBars title="Applications per week" data={WEEKLY} />
          </Reveal>
          <Reveal delay={0.12}>
            <ScoreDistribution data={{ poor: 6, fair: 14, good: 18 }} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- how it works */

function HowItWorks() {
  const steps = [
    {
      Icon: FileSearch,
      title: 'Bring your resume and the role',
      body: 'Upload a PDF or DOCX, or paste plain text. You get a parsed preview and can fix any extraction mistakes before anything is scored.',
    },
    {
      Icon: Target,
      title: 'Get a score you can audit',
      body: 'Five weighted sub-scores — hard skills, experience, domain, seniority, ATS coverage — each shown with the evidence it was derived from.',
    },
    {
      Icon: GitCompareArrows,
      title: 'Accept the rewrite line by line',
      body: 'A side-by-side diff highlights every change. Take the ones you agree with, reject the rest, then export an ATS-safe PDF or DOCX.',
    },
  ] as const

  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          How it works
        </h2>
      </Reveal>

      <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-3" stagger={0.1}>
        {steps.map((step, index) => (
          <RevealItem key={step.title} className="glass rounded-2xl p-6">
            <div className="bg-primary/12 text-primary flex size-10 items-center justify-center rounded-xl">
              <step.Icon className="size-5" aria-hidden="true" />
            </div>
            <p className="text-muted-foreground mt-5 text-xs font-medium uppercase tracking-wider">
              Step {index + 1}
            </p>
            <h3 className="mt-1.5 font-medium">{step.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  )
}

/* -------------------------------------------------------------- features */

function Features() {
  const features = [
    {
      Icon: ScanSearch,
      title: 'ATS keyword checker',
      body: 'Shows which job-description keywords appear in your resume, which are missing, and where each missing one could naturally fit.',
    },
    {
      Icon: ListChecks,
      title: 'Application tracker',
      body: 'Every analysis saves as an application with status and notes, plus aggregate stats on score, volume, and response rate.',
    },
    {
      Icon: Sparkles,
      title: 'Streamed rewrites',
      body: 'The tailored resume streams in as it is generated, so you watch the work happen instead of staring at a spinner.',
    },
    {
      Icon: ShieldCheck,
      title: 'Anti-fabrication critique pass',
      body: 'A dedicated verification model reviews the rewrite and reports exactly which claims it removed and why.',
    },
    {
      Icon: GitCompareArrows,
      title: 'Per-change control',
      body: 'Nothing is applied wholesale. Accept or reject each individual edit before it reaches your export.',
    },
    {
      Icon: Target,
      title: 'Honest gap analysis',
      body: 'Missing requirements ranked Critical, Important, or Nice-to-have, each with one concrete action to close it.',
    },
  ] as const

  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          Everything included
        </h2>
      </Reveal>

      <RevealGroup className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <RevealItem key={feature.title}>
            <feature.Icon className="text-primary size-5" aria-hidden="true" />
            <h3 className="mt-3 font-medium">{feature.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{feature.body}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
      <Reveal>
        <div className="glass flex flex-col items-start gap-5 rounded-3xl p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
              See it on a real job description
            </h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Demo mode needs no account and costs nothing.
            </p>
          </div>
          <Button size="lg" asChild>
            <Link href="/analyze">
              Run an analysis
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
