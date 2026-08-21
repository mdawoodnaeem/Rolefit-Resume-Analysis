import Link from 'next/link'
import { LayoutDashboard, LogOut, Sparkles } from 'lucide-react'

import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signOut } from '@/server/auth'
import { cn, initials, pluralize } from '@/lib/utils'
import type { QuotaStatus } from '@/server/quota'

type AppHeaderProps = {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null }
  quota: QuotaStatus
}

export function AppHeader({ user, quota }: AppHeaderProps) {
  const label = user.name ?? user.email ?? 'Account'

  return (
    <header className="glass-bar sticky top-0 z-40">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="rounded-md transition-opacity hover:opacity-80">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          <NavLink href="/dashboard" icon={<LayoutDashboard aria-hidden="true" />}>
            Dashboard
          </NavLink>
          <NavLink href="/analyze" icon={<Sparkles aria-hidden="true" />}>
            New analysis
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <QuotaMeter quota={quota} />
          <ThemeToggle />

          <div
            className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium"
            title={label}
            aria-hidden="true"
          >
            {initials(label)}
          </div>

          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors [&_svg]:size-4"
    >
      {icon}
      {children}
    </Link>
  )
}

/**
 * Usage meter.
 *
 * Shows remaining rather than used: "2 left" is the number that changes what
 * someone does next, where "3 of 5 used" makes them do the subtraction. It
 * turns destructive-red only when the allowance is actually gone, so the
 * colour still means something when it appears.
 */
function QuotaMeter({ quota }: { quota: QuotaStatus }) {
  if (quota.unlimited) {
    return (
      <Badge variant="secondary" className="hidden sm:inline-flex">
        Pro
      </Badge>
    )
  }

  const exhausted = quota.remaining === 0

  return (
    <Link
      href="/pricing"
      className="hidden rounded-md sm:inline-flex"
      aria-label={`${quota.remaining} of ${quota.limit} analyses remaining this month. View plans.`}
    >
      <Badge
        variant={exhausted ? 'missing' : 'outline'}
        className={cn('gap-1.5 tabular', !exhausted && 'glass-subtle')}
      >
        <span aria-hidden="true">
          {quota.remaining} {pluralize(quota.remaining, 'analysis', 'analyses')} left
        </span>
      </Badge>
    </Link>
  )
}
