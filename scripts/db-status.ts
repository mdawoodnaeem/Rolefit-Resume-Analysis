import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'

/** Prints what is actually in the local database. `npm run db:status` */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const counts = {
  User: await db.user.count(),
  Resume: await db.resume.count(),
  ResumeVersion: await db.resumeVersion.count(),
  JobDescription: await db.jobDescription.count(),
  Analysis: await db.analysis.count(),
  Application: await db.application.count(),
  UsageLog: await db.usageLog.count(),
  AnalysisCache: await db.analysisCache.count(),
  RateLimitBucket: await db.rateLimitBucket.count(),
}

console.log(`\nConnected: ${process.env.DATABASE_URL}\n`)
console.log('Rows:')
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(17)} ${count}`)
}

const users = await db.user.findMany({ select: { email: true, plan: true, role: true } })
console.log('\nAccounts:')
for (const user of users) console.log(`  ${user.email}  (${user.plan} / ${user.role})`)

const spend = await db.usageLog.aggregate({ _sum: { estimatedCostUsd: true } })
console.log(`\nLogged model spend: $${Number(spend._sum.estimatedCostUsd ?? 0).toFixed(4)}`)

await db.$disconnect()
