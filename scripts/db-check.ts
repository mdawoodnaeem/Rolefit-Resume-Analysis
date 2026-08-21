import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Verifies a database connection and reports what is actually on the other
 * end. Run after pointing DATABASE_URL at a hosted provider:
 *
 *   npm run db:check
 *
 * The two most common ways a Supabase setup goes wrong are silent, so both are
 * checked explicitly here rather than left to fail later:
 *
 *   1. DIRECT_URL pointed at the transaction pooler. Migrations open long
 *      sessions and issue DDL, which PgBouncer in transaction mode cannot
 *      carry — `prisma migrate` then hangs or dies with a confusing error.
 *   2. Both URLs set to the same string. It works until the first migration.
 */

type Check = { label: string; ok: boolean; detail: string }

const checks: Check[] = []

function describeUrl(raw: string | undefined, name: string): URL | null {
  if (!raw) {
    checks.push({ label: name, ok: false, detail: 'not set' })
    return null
  }

  try {
    return new URL(raw)
  } catch {
    checks.push({ label: name, ok: false, detail: 'not a valid connection URL' })
    return null
  }
}

const databaseUrl = describeUrl(process.env.DATABASE_URL, 'DATABASE_URL')
const directUrl = describeUrl(process.env.DIRECT_URL, 'DIRECT_URL')

const isPooler = (url: URL | null) =>
  url ? url.port === '6543' || url.hostname.includes('pooler') : false

if (databaseUrl) {
  checks.push({
    label: 'DATABASE_URL',
    ok: true,
    detail: `${databaseUrl.hostname}:${databaseUrl.port || '5432'}${isPooler(databaseUrl) ? '  (pooled — correct for runtime)' : '  (direct)'}`,
  })
}

if (directUrl) {
  const pooled = isPooler(directUrl)
  checks.push({
    label: 'DIRECT_URL',
    ok: !pooled,
    detail: pooled
      ? `${directUrl.hostname}:${directUrl.port} — this is the POOLER. Migrations will fail. Use the direct/session connection (port 5432).`
      : `${directUrl.hostname}:${directUrl.port || '5432'}  (direct — correct for migrations)`,
  })
}

if (
  databaseUrl &&
  directUrl &&
  process.env.DATABASE_URL === process.env.DIRECT_URL &&
  isPooler(databaseUrl)
) {
  checks.push({
    label: 'URL pair',
    ok: false,
    detail: 'Both point at the pooler. DIRECT_URL must be the unpooled connection.',
  })
}

/* ----------------------------------------------------------- live check --- */

let connected = false

if (process.env.DATABASE_URL) {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

  try {
    const started = Date.now()
    const rows = await db.$queryRaw<Array<{ version: string }>>`SELECT version()`
    const latency = Date.now() - started
    // noUncheckedIndexedAccess is on, so the row is possibly-undefined even
    // though SELECT version() always returns one.
    const version = rows[0]?.version ?? 'unknown server'

    connected = true
    checks.push({
      label: 'Connection',
      ok: true,
      detail: `${version.split(',')[0]}  (${latency}ms round trip)`,
    })

    const tables = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `
    const tableCount = Number(tables[0]?.count ?? 0)

    checks.push({
      label: 'Schema',
      ok: tableCount > 0,
      detail:
        tableCount > 0
          ? `${tableCount} tables present`
          : 'empty — run `npm run db:migrate` to create the schema',
    })

    if (tableCount > 0) {
      const users = await db.user.count()
      checks.push({
        label: 'Data',
        ok: true,
        detail:
          users > 0
            ? `${users} account(s)`
            : 'no accounts yet — run `npm run db:seed` for the demo data',
      })
    }
  } catch (error) {
    checks.push({
      label: 'Connection',
      ok: false,
      detail: error instanceof Error ? error.message.split('\n')[0]! : String(error),
    })
  } finally {
    await db.$disconnect()
  }
}

/* -------------------------------------------------------------- report --- */

console.log('')
for (const check of checks) {
  console.log(`  ${check.ok ? '✓' : '✗'}  ${check.label.padEnd(13)} ${check.detail}`)
}

const failures = checks.filter((check) => !check.ok)
console.log('')

if (failures.length === 0) {
  console.log('  Database is ready.\n')
} else {
  console.log(`  ${failures.length} problem(s) to fix — see above.\n`)
  process.exitCode = 1
}

if (!connected) process.exitCode = 1
