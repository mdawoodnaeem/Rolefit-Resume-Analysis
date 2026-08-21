import { env } from '@/lib/env'
import { db } from '@/server/db'
import type { PlanTier } from '@/generated/prisma/enums'

/**
 * Monthly analysis quota for the free tier.
 *
 * Counted over Analysis rows rather than UsageLog rows: one analysis fans out
 * into five model calls, and a user should be charged one unit of quota for
 * one thing they asked for, not five for an implementation detail. The
 * (userId, startedAt) index on Analysis is what makes this a cheap count.
 *
 * Cached analyses still count. They cost nothing to serve, but the quota is a
 * product limit on how much of the service you use, not a cost-recovery
 * mechanism — and making cache hits free would leak whether someone else had
 * already run the same resume against the same job description.
 */

export type QuotaStatus = {
  used: number
  limit: number
  remaining: number
  /** True when a further analysis may be started. */
  allowed: boolean
  /** When the allowance resets. */
  resetsAt: Date
  unlimited: boolean
}

/** First instant of the next calendar month, UTC. */
function startOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function getQuotaStatus(
  userId: string,
  plan: PlanTier,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const resetsAt = startOfNextMonth(now)

  if (plan !== 'FREE') {
    return {
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      allowed: true,
      resetsAt,
      unlimited: true,
    }
  }

  const limit = env.ROLEFIT_FREE_MONTHLY_ANALYSES

  const used = await db.analysis.count({
    where: {
      userId,
      startedAt: { gte: startOfMonth(now) },
      // A run that failed before producing anything should not burn an
      // allowance the user got no value from.
      status: { not: 'FAILED' },
    },
  })

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    allowed: used < limit,
    resetsAt,
    unlimited: false,
  }
}

export class QuotaExceededError extends Error {
  constructor(readonly status: QuotaStatus) {
    super(
      `Monthly analysis limit reached (${status.used}/${status.limit}). Resets ${status.resetsAt.toISOString().slice(0, 10)}.`,
    )
    this.name = 'QuotaExceededError'
  }
}

/** Throws QuotaExceededError when the caller is out of allowance. */
export async function assertWithinQuota(
  userId: string,
  plan: PlanTier,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const status = await getQuotaStatus(userId, plan, now)
  if (!status.allowed) throw new QuotaExceededError(status)
  return status
}
