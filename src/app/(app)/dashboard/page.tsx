import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Inbox } from 'lucide-react'

import { ScoreDistribution } from '@/components/charts/score-distribution'
import { StatTile } from '@/components/charts/stat-tile'
import { WeeklyBars } from '@/components/charts/weekly-bars'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { auth } from '@/server/auth'
import { getDashboardStats, getRecentApplications } from '@/server/queries/dashboard'
import { cn, scoreBandTextClass, scoreBandLabel } from '@/lib/utils'
import type { ApplicationStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = { title: 'Dashboard' }

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  APPLIED: 'Applied',
  INTERVIEWING: 'Interviewing',
  REJECTED: 'Rejected',
  OFFER: 'Offer',
}

const STATUS_VARIANT: Record<ApplicationStatus, 'outline' | 'secondary' | 'present' | 'missing'> = {
  DRAFT: 'outline',
  APPLIED: 'secondary',
  INTERVIEWING: 'present',
  REJECTED: 'missing',
  OFFER: 'present',
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const [stats, recent] = await Promise.all([
    getDashboardStats(session.user.id),
    getRecentApplications(session.user.id),
  ])

  if (stats.totalApplications === 0) return <EmptyState />

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {stats.submittedCount} submitted · {stats.respondedCount} answered
            {stats.scoreRange
              ? ` · scores ${stats.scoreRange.min}–${stats.scoreRange.max}`
              : null}
          </p>
        </div>

        <Button asChild>
          <Link href="/analyze">
            New analysis
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Average match"
          value={stats.averageScore ?? 0}
          decimals={1}
          hint={stats.averageScore ? scoreBandLabel(stats.averageScore) : undefined}
        />
        <StatTile label="Applications" value={stats.totalApplications} />
        <StatTile
          label="Response rate"
          value={stats.responseRate}
          suffix="%"
          decimals={1}
          hint={`${stats.respondedCount} of ${stats.submittedCount} answered`}
        />
        <StatTile
          label="In play"
          value={stats.interviewingCount}
          hint="Interviewing or offered"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* The window is named in the title on purpose. The chart counts only
            the last 8 weeks, so its total can legitimately be lower than the
            submitted count in the header — without the label that reads as an
            arithmetic bug rather than a date range. */}
        <WeeklyBars title="Applications — last 8 weeks" data={stats.weekly} />
        <ScoreDistribution data={stats.distribution} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium tracking-tight">Recent applications</h2>

        <ul className="mt-4 space-y-2">
          {recent.map((application) => (
            <li key={application.id}>
              <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{application.roleTitle}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {application.company}
                    {application.location ? ` · ${application.location}` : null}
                  </p>
                </div>

                <Badge variant={STATUS_VARIANT[application.status]}>
                  {STATUS_LABEL[application.status]}
                </Badge>

                {application.matchScoreSnapshot !== null ? (
                  <span
                    className={cn(
                      'tabular w-9 text-right text-sm font-semibold',
                      scoreBandTextClass(application.matchScoreSnapshot),
                    )}
                    title={scoreBandLabel(application.matchScoreSnapshot)}
                  >
                    {application.matchScoreSnapshot}
                  </span>
                ) : (
                  <span className="text-muted-foreground w-9 text-right text-sm">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 pt-24 text-center">
      <div className="glass grid size-16 place-items-center rounded-2xl">
        <Inbox className="text-muted-foreground size-7" aria-hidden="true" />
      </div>

      <h1 className="mt-6 text-xl font-semibold tracking-tight">No applications yet</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Run your first analysis and it will be saved here as an application, with its match score
        and gaps attached.
      </p>

      <Button asChild size="lg" className="mt-7">
        <Link href="/analyze">
          Analyse a job description
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}
