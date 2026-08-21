import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Runs the real dashboard aggregates against the seeded database.
 *
 * This exists so "the schema supports the dashboard" is a demonstrated fact
 * rather than a design claim — every query here is one the app will actually
 * issue, hitting the indexes the schema declares.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@rolefit.app' } })

  const [applications, avg, byStatus, usage] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id },
      select: { matchScoreSnapshot: true, status: true, appliedAt: true, respondedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.application.aggregate({
      where: { userId: user.id },
      _avg: { matchScoreSnapshot: true },
      _count: true,
    }),
    prisma.application.groupBy({
      by: ['status'],
      where: { userId: user.id },
      _count: true,
    }),
    prisma.usageLog.aggregate({
      where: { userId: user.id },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
      _count: true,
    }),
  ])

  const scores = applications
    .map((a) => a.matchScoreSnapshot)
    .filter((s): s is number => s !== null)

  const distribution = {
    poor: scores.filter((s) => s < 45).length,
    fair: scores.filter((s) => s >= 45 && s < 65).length,
    good: scores.filter((s) => s >= 65).length,
  }

  const submitted = applications.filter((a) => a.appliedAt !== null)
  const responded = submitted.filter((a) => a.respondedAt !== null)
  const responseRate = submitted.length ? (responded.length / submitted.length) * 100 : 0

  // Applications per ISO week, the shape the bar chart consumes.
  const perWeek = new Map<string, number>()
  for (const app of submitted) {
    const d = app.appliedAt!
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1)
  }

  const monthlyAnalyses = await prisma.analysis.count({
    where: {
      userId: user.id,
      startedAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) },
    },
  })

  console.log('=== dashboard aggregates (live queries) ===\n')
  console.log(`applications      : ${avg._count}`)
  console.log(`average match     : ${avg._avg.matchScoreSnapshot?.toFixed(1)}`)
  console.log(`score range       : ${Math.min(...scores)} – ${Math.max(...scores)}`)
  console.log(`distribution      : weak ${distribution.poor} · partial ${distribution.fair} · strong ${distribution.good}`)
  console.log(`submitted         : ${submitted.length}`)
  console.log(`responded         : ${responded.length}`)
  console.log(`response rate     : ${responseRate.toFixed(1)}%`)
  console.log(`quota used (month): ${monthlyAnalyses}`)
  console.log('\nby status:')
  for (const row of byStatus.sort((a, b) => b._count - a._count)) {
    console.log(`  ${row.status.padEnd(13)} ${row._count}`)
  }
  console.log('\napplications per week:')
  for (const [week, count] of [...perWeek.entries()].sort()) {
    console.log(`  ${week}  ${'█'.repeat(count)} ${count}`)
  }
  console.log('\nmodel usage:')
  console.log(`  calls logged    : ${usage._count}`)
  console.log(`  input tokens    : ${usage._sum.inputTokens?.toLocaleString()}`)
  console.log(`  cached input    : ${usage._sum.cacheReadTokens?.toLocaleString()}`)
  console.log(`  output tokens   : ${usage._sum.outputTokens?.toLocaleString()}`)
  console.log(`  estimated spend : $${Number(usage._sum.estimatedCostUsd ?? 0).toFixed(4)}`)
  console.log(
    `  per analysis    : $${(Number(usage._sum.estimatedCostUsd ?? 0) / 12).toFixed(4)}`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
