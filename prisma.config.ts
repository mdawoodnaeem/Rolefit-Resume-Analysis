import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 config.
 *
 * Connection URLs no longer live in schema.prisma. There are two of them and
 * they are used by different things:
 *
 *   DIRECT_URL   -> here. Migrate opens long-lived sessions and issues DDL,
 *                   which a transaction pooler (PgBouncer, Neon's `-pooler`
 *                   host) will break. Migrations must bypass it.
 *   DATABASE_URL -> the pg driver adapter in src/server/db.ts. This is the
 *                   pooled connection the running app uses, which is what you
 *                   want on serverless where every request may be a new
 *                   process.
 *
 * On a local Postgres there is no pooler, so both are the same string.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
})
