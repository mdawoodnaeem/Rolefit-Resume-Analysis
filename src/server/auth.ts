import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth'
// Side-effect import: TypeScript will not accept a `declare module` for a
// subpath it has not loaded, so augmenting JWT below fails without this.
import 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'

import { adminEmails, env, githubOAuthEnabled } from '@/lib/env'
import { credentialsSchema } from '@/lib/validation/auth'
import { db } from '@/server/db'
import type { PlanTier, UserRole } from '@/generated/prisma/enums'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      plan: PlanTier
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    plan: PlanTier
    sessionVersion: number
    /** Epoch ms of the last revocation re-check. */
    checkedAt: number
  }
}

/**
 * How often to re-read sessionVersion from the database.
 *
 * JWTs are stateless, so a revoked session stays valid until its token is next
 * verified against the source of truth. Every request would be correct but
 * would also reintroduce the per-request database read that the JWT strategy
 * exists to avoid. Five minutes bounds the window in which a signed-out
 * session can still act, which is the right trade for this application.
 */
const REVOCATION_CHECK_INTERVAL_MS = 5 * 60 * 1000

const providers: NextAuthConfig['providers'] = [
  Credentials({
    id: 'credentials',
    name: 'Email and password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw)
      if (!parsed.success) return null

      const { email, password } = parsed.data
      const user = await db.user.findUnique({ where: { email } })

      // Compare against a dummy hash when no user exists so the response time
      // does not reveal whether an address is registered. bcrypt is slow by
      // design, and skipping it on the miss path is a timing oracle.
      const hash = user?.passwordHash ?? DUMMY_HASH
      const valid = await bcrypt.compare(password, hash)

      if (!user?.passwordHash || !valid) return null

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      }
    },
  }),
]

if (githubOAuthEnabled) {
  providers.push(
    GitHub({
      clientId: env.AUTH_GITHUB_ID!,
      clientSecret: env.AUTH_GITHUB_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  )
}

/** bcrypt hash of a value nobody can supply; only used to equalise timing. */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export const authConfig = {
  adapter: PrismaAdapter(db),

  // Credentials sign-in only works with the JWT strategy in Auth.js v5 — the
  // adapter cannot mint a database session for it. The Session model still
  // exists because the adapter's types require it; revocation is handled by
  // User.sessionVersion instead. See prisma/schema.prisma.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  secret: env.AUTH_SECRET,
  trustHost: true,

  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },

  providers,

  callbacks: {
    async jwt({ token, user, trigger }) {
      // Fresh sign-in: load the authoritative role/plan once.
      if (user?.id) {
        const record = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, plan: true, sessionVersion: true },
        })

        token.id = user.id
        token.role = record?.role ?? 'USER'
        token.plan = record?.plan ?? 'FREE'
        token.sessionVersion = record?.sessionVersion ?? 0
        token.checkedAt = Date.now()
        return token
      }

      const stale = Date.now() - (token.checkedAt ?? 0) > REVOCATION_CHECK_INTERVAL_MS
      if (!stale && trigger !== 'update') return token

      const record = await db.user.findUnique({
        where: { id: token.id },
        select: { role: true, plan: true, sessionVersion: true },
      })

      // Deleted user, or sessionVersion bumped by a "sign out everywhere".
      // Returning null invalidates the token.
      if (!record || record.sessionVersion !== token.sessionVersion) {
        return null
      }

      token.role = record.role
      token.plan = record.plan
      token.checkedAt = Date.now()
      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.plan = token.plan
      return session
    },
  },

  events: {
    /**
     * Grant admin on first sign-in for addresses listed in the environment.
     * Doing it here rather than in the seed means the operator of a fresh
     * deployment gets the usage dashboard without a manual database edit.
     */
    async signIn({ user }) {
      if (!user.email || !user.id) return
      if (!adminEmails.has(user.email.toLowerCase())) return

      await db.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      })
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

/** Bump a user's sessionVersion, invalidating every outstanding JWT. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  })
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}
