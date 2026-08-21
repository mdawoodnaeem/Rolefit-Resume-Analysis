import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/**
 * Prisma 7 client.
 *
 * Two things changed in v7 and both show up here. Connection URLs no longer
 * live in schema.prisma, and the client no longer opens its own connection —
 * it takes a driver adapter. So the runtime URL is read here (DATABASE_URL,
 * the pooled one) while migrations read DIRECT_URL from prisma.config.ts.
 *
 * The global cache is the standard Next.js dev guard: hot reload re-evaluates
 * this module on every edit, and without it each reload leaks a fresh pool
 * until Postgres refuses new connections.
 */

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill in a Postgres connection string.',
    )
  }

  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
