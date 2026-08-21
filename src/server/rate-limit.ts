import { env } from '@/lib/env'
import { db } from '@/server/db'

/**
 * Token-bucket rate limiter, in Postgres.
 *
 * Redis is the reflexive choice here and would be faster, but it is also a
 * second service to provision, pay for, and keep alive for a workload of five
 * analyses per user per month. The UsageLog table already exists; this adds
 * one more small table and no new infrastructure. If throughput ever justifies
 * Upstash, only this file changes.
 *
 * The whole refill-and-consume is a single statement. Reading the bucket,
 * computing the refill in JavaScript, and writing it back would be a
 * read-modify-write race: two concurrent requests both read 1 token, both
 * decide they may proceed, and the limit is silently double-spent. Doing the
 * arithmetic inside the UPDATE makes the row lock do the work.
 *
 * The conditional `WHERE` is what enforces the limit: when the refilled
 * balance is below one token the update does not fire, and the statement
 * returns zero rows. No rows means denied.
 */

export type RateLimitResult = {
  allowed: boolean
  /** Whole tokens left after this request. */
  remaining: number
  /** Seconds until one token is available again. Zero when allowed. */
  retryAfterSeconds: number
}

type BucketRow = { tokens: number }

export async function consumeToken(
  key: string,
  {
    capacity = env.ROLEFIT_AI_RATE_LIMIT_PER_MINUTE,
    refillPerSecond = env.ROLEFIT_AI_RATE_LIMIT_PER_MINUTE / 60,
  }: { capacity?: number; refillPerSecond?: number } = {},
): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<BucketRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "tokens", "lastRefillAt", "createdAt")
    VALUES (${key}, ${capacity - 1}, now(), now())
    ON CONFLICT ("key") DO UPDATE
      SET "tokens" = LEAST(
            ${capacity}::double precision,
            "RateLimitBucket"."tokens"
              + EXTRACT(EPOCH FROM (now() - "RateLimitBucket"."lastRefillAt"))
              * ${refillPerSecond}::double precision
          ) - 1,
          "lastRefillAt" = now()
      WHERE LEAST(
            ${capacity}::double precision,
            "RateLimitBucket"."tokens"
              + EXTRACT(EPOCH FROM (now() - "RateLimitBucket"."lastRefillAt"))
              * ${refillPerSecond}::double precision
          ) >= 1
    RETURNING "tokens"
  `

  const row = rows[0]

  if (!row) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(1 / refillPerSecond)),
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(row.tokens)),
    retryAfterSeconds: 0,
  }
}

/** Namespaced bucket key so user and IP limits cannot collide. */
export function rateLimitKey(scope: 'user' | 'ip', identifier: string): string {
  return `${scope}:${identifier}:ai`
}

/**
 * Drop buckets that have been idle long enough to have fully refilled — they
 * carry no information and would otherwise accumulate one row per anonymous IP
 * forever. Safe to call from a cron; safe to never call.
 */
export async function pruneRateLimitBuckets(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { lastRefillAt: { lt: cutoff } },
  })
  return count
}
