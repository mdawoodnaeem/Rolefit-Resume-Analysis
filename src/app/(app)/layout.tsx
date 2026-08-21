import { redirect } from 'next/navigation'

import { AuroraBackground } from '@/components/aurora-background'
import { AppHeader } from '@/components/app/app-header'
import { auth } from '@/server/auth'
import { getQuotaStatus } from '@/server/quota'

/**
 * Auth guard for every signed-in route.
 *
 * Deliberately a server-component layout rather than middleware: the session
 * check runs through the Prisma adapter, and middleware executes on the edge
 * runtime where Prisma cannot follow. Doing it here keeps one code path in
 * Node instead of maintaining a second edge-safe auth config purely to
 * satisfy the matcher.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const quota = await getQuotaStatus(session.user.id, session.user.plan)

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground />
      <AppHeader user={session.user} quota={quota} />
      <main id="main" className="flex-1 pb-20">
        {children}
      </main>
    </div>
  )
}
