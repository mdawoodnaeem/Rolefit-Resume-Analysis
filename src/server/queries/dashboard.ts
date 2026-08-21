import 'server-only'

import { db } from '@/server/db'
import type { ApplicationStatus } from '@/generated/prisma/enums'

/**
 * Aggregates behind the dashboard.
 *
 * Every figure here is derived from Application.matchScoreSnapshot rather than
 * joining through to Analysis. That denormalised column exists precisely so
 * this page is one indexed table scan instead of a two-hop join per card — and
 * so the numbers survive an analysis being deleted.
 */

export type WeeklyPoint = { label: string; value: number; weekStart: string }

export type DashboardStats = {
  totalApplications: number
  averageScore: number | null
  scoreRange: { min: number; max: number } | null
  responseRate: number
  submittedCount: number
  respondedCount: number
  interviewingCount: number
  byStatus: Record<ApplicationStatus, number>
  distribution: { poor: number; fair: number; good: number }
  weekly: WeeklyPoint[]
}

const EMPTY_STATUS: Record<ApplicationStatus, number> = {
  DRAFT: 0,
  APPLIED: 0,
  INTERVIEWING: 0,
  REJECTED: 0,
  OFFER: 0,
}

/** Monday 00:00 UTC of the week containing `date`. */
function weekStart(date: Date): Date {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday
}

const WEEK_LABEL = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export async function getDashboardStats(
  userId: string,
  { weeks = 8 }: { weeks?: number } = {},
): Promise<DashboardStats> {
  const applications = await db.application.findMany({
    where: { userId },
    select: {
      status: true,
      matchScoreSnapshot: true,
      appliedAt: true,
      respondedAt: true,
    },
  })

  const byStatus = { ...EMPTY_STATUS }
  for (const app of applications) byStatus[app.status] += 1

  const scores = applications
    .map((app) => app.matchScoreSnapshot)
    .filter((score): score is number => score !== null)

  const submitted = applications.filter((app) => app.appliedAt !== null)
  const responded = submitted.filter((app) => app.respondedAt !== null)

  // Build every week in the window up front, so quiet weeks render as gaps in
  // the chart instead of silently collapsing the x-axis.
  const thisWeek = weekStart(new Date())
  const buckets = new Map<string, WeeklyPoint>()

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(thisWeek)
    start.setUTCDate(start.getUTCDate() - i * 7)
    const key = start.toISOString().slice(0, 10)
    buckets.set(key, { label: WEEK_LABEL.format(start), value: 0, weekStart: key })
  }

  for (const app of submitted) {
    const key = weekStart(app.appliedAt!).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (bucket) bucket.value += 1
  }

  return {
    totalApplications: applications.length,
    averageScore: scores.length
      ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
      : null,
    scoreRange: scores.length
      ? { min: Math.min(...scores), max: Math.max(...scores) }
      : null,
    responseRate: submitted.length
      ? Math.round((responded.length / submitted.length) * 1000) / 10
      : 0,
    submittedCount: submitted.length,
    respondedCount: responded.length,
    interviewingCount: byStatus.INTERVIEWING + byStatus.OFFER,
    byStatus,
    distribution: {
      poor: scores.filter((s) => s < 45).length,
      fair: scores.filter((s) => s >= 45 && s < 65).length,
      good: scores.filter((s) => s >= 65).length,
    },
    weekly: [...buckets.values()],
  }
}

export async function getRecentApplications(userId: string, take = 6) {
  return db.application.findMany({
    where: { userId },
    orderBy: [{ appliedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    take,
    select: {
      id: true,
      company: true,
      roleTitle: true,
      location: true,
      status: true,
      matchScoreSnapshot: true,
      appliedAt: true,
      notes: true,
    },
  })
}
