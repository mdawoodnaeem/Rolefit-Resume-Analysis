import type { Metadata } from 'next'
import Link from 'next/link'
import { FlaskConical } from 'lucide-react'

import { AnalyzeFlow } from '@/components/analyze/analyze-flow'
import { AuroraBackground } from '@/components/aurora-background'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { demoModeEnabled } from '@/lib/env'
import { auth } from '@/server/auth'
import { getQuotaStatus } from '@/server/quota'
import { pluralize } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'New analysis',
  description:
    'Paste a job description and upload your resume for an honest match score, gap analysis, and a rewrite grounded in what you have actually done.',
}

/**
 * Deliberately outside the (app) route group, which requires a session.
 *
 * The landing page promises "try it, no signup", and a portfolio piece that
 * demands an account before it shows anything is one nobody evaluates.
 * Anonymous runs go through demo mode, are rate limited by IP, and are not
 * persisted — the page says so rather than letting someone discover it after
 * the fact.
 */
export default async function AnalyzePage() {
  const session = await auth()
  const user = session?.user ?? null

  const quota = user ? await getQuotaStatus(user.id, user.plan) : null

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground />

      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-4 px-4 sm:px-6">
          <Link
            href={user ? '/dashboard' : '/'}
            className="rounded-md transition-opacity hover:opacity-80"
          >
            <Logo />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {quota && !quota.unlimited ? (
              <Badge variant="outline" className="glass-subtle tabular hidden sm:inline-flex">
                {quota.remaining} {pluralize(quota.remaining, 'analysis', 'analyses')} left
              </Badge>
            ) : null}

            <ThemeToggle />

            {user ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pb-24">
        <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New analysis</h1>
          <p className="text-muted-foreground mt-2 text-pretty leading-relaxed">
            You will get a match score with its reasoning shown, an honest list of what you are
            missing, and keyword coverage — before anything is rewritten.
          </p>

          {!user || demoModeEnabled ? (
            <div className="glass-subtle mt-6 flex items-start gap-3 rounded-xl p-4">
              <FlaskConical className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="text-sm leading-relaxed">
                <p className="font-medium">Running in demo mode</p>
                <p className="text-muted-foreground mt-1">
                  {user
                    ? 'This deployment has no model key configured, so scoring is by keyword and structure overlap rather than by a language model.'
                    : 'Scored by keyword and structure overlap rather than by a language model, and not saved. Create an account to keep your analyses.'}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <AnalyzeFlow />
          </div>
        </div>
      </main>
    </div>
  )
}
