// @vitest-environment node
import 'dotenv/config'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { consumeToken, rateLimitKey } from '@/server/rate-limit'
import { db } from '@/server/db'

/**
 * Integration tests against the embedded Postgres (`npm run db:start`).
 *
 * The interesting property is not "does it count" — it is that the count holds
 * under concurrency. A read-modify-write limiter passes a sequential test and
 * still lets N parallel requests each observe the same balance and all proceed.
 * The concurrent case below is the one that actually justifies putting the
 * arithmetic inside the UPDATE.
 */

const KEY = rateLimitKey('user', 'test-subject')

async function resetBucket(key: string) {
  await db.rateLimitBucket.deleteMany({ where: { key } })
}

describe('consumeToken', () => {
  beforeEach(async () => {
    await resetBucket(KEY)
  })

  afterAll(async () => {
    await resetBucket(KEY)
    await db.$disconnect()
  })

  it('allows the first request and reports the remaining balance', async () => {
    const result = await consumeToken(KEY, { capacity: 3, refillPerSecond: 0 })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.retryAfterSeconds).toBe(0)
  })

  it('allows exactly `capacity` requests, then denies', async () => {
    const capacity = 4
    const outcomes: boolean[] = []

    for (let i = 0; i < capacity + 2; i += 1) {
      const { allowed } = await consumeToken(KEY, { capacity, refillPerSecond: 0 })
      outcomes.push(allowed)
    }

    expect(outcomes.filter(Boolean)).toHaveLength(capacity)
    expect(outcomes.slice(capacity)).toEqual([false, false])
  })

  it('reports a retry-after once denied', async () => {
    await consumeToken(KEY, { capacity: 1, refillPerSecond: 0.5 })
    const denied = await consumeToken(KEY, { capacity: 1, refillPerSecond: 0.5 })

    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterSeconds).toBe(2)
  })

  it('does not over-grant when requests arrive concurrently', async () => {
    const capacity = 5
    const attempts = 25

    // All 25 land at once. A limiter that reads, computes, then writes would
    // let far more than 5 through here.
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        consumeToken(KEY, { capacity, refillPerSecond: 0 }),
      ),
    )

    const granted = results.filter((result) => result.allowed).length
    expect(granted).toBe(capacity)
  })

  it('refills over time', async () => {
    // Capacity 1, refilling at 50/second: one token is back within ~20ms.
    await consumeToken(KEY, { capacity: 1, refillPerSecond: 50 })
    expect((await consumeToken(KEY, { capacity: 1, refillPerSecond: 50 })).allowed).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect((await consumeToken(KEY, { capacity: 1, refillPerSecond: 50 })).allowed).toBe(true)
  })

  it('keeps separate buckets per key', async () => {
    const other = rateLimitKey('ip', 'test-subject')
    await resetBucket(other)

    await consumeToken(KEY, { capacity: 1, refillPerSecond: 0 })
    const otherResult = await consumeToken(other, { capacity: 1, refillPerSecond: 0 })

    expect(otherResult.allowed).toBe(true)
    await resetBucket(other)
  })
})
