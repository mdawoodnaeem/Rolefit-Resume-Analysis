import Link from 'next/link'
import { FlaskConical, Zap } from 'lucide-react'

import { GapList } from '@/components/analysis/gap-list'
import { KeywordReportCard } from '@/components/analysis/keyword-report'
import { SubScores } from '@/components/analysis/sub-scores'
import { TailorSection } from '@/components/analysis/tailor-section'
import { ScoreGauge } from '@/components/charts/score-gauge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AnalysisResult } from '@/server/pipeline/analyze'
import { scoreBandLabel } from '@/lib/utils'

/**
 * The results view.
 *
 * The verdict sits directly beside the gauge rather than below the fold. A
 * number alone invites the reader to supply their own interpretation, and the
 * interpretation people supply for their own resume is a generous one.
 */
export function AnalysisResultView({
  result,
  persisted,
  analysisId,
  resumeText,
  jobText,
  sourceType,
}: {
  result: AnalysisResult
  persisted: boolean
  analysisId?: string
  /** Passed through to the rewrite step, which re-reads them from cache. */
  resumeText: string
  jobText: string
  sourceType: string
}) {
  const { report, job, keywords, demoMode, cacheHit } = result

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl p-5 sm:p-7" aria-labelledby="verdict-heading">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="glow-primary shrink-0 rounded-full">
            <ScoreGauge score={report.overallScore} size={180} />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 id="verdict-heading" className="text-lg font-semibold tracking-tight">
                {scoreBandLabel(report.overallScore)}
              </h1>
              {demoMode ? (
                <Badge variant="outline" className="gap-1">
                  <FlaskConical aria-hidden="true" />
                  Demo mode
                </Badge>
              ) : null}
              {cacheHit ? (
                <Badge variant="secondary" className="gap-1" title="Served from cache — no cost">
                  <Zap aria-hidden="true" />
                  Cached
                </Badge>
              ) : null}
            </div>

            <p className="text-muted-foreground mt-1.5 text-sm">
              {job.title}
              {job.company ? ` · ${job.company}` : null}
              {job.seniority !== 'unspecified' ? ` · ${job.seniority}` : null}
            </p>

            <p className="mt-4 text-pretty leading-relaxed">{report.verdict}</p>

            {report.strengths.length > 0 ? (
              <div className="mt-5">
                <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  What already fits
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {report.strengths.slice(0, 4).map((strength, index) => (
                    <li
                      key={index}
                      className="text-muted-foreground text-sm leading-relaxed"
                    >
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SubScores report={report} />
        <KeywordReportCard report={keywords} />
      </div>

      <GapList gaps={report.gaps} />

      <TailorSection resumeText={resumeText} jobText={jobText} sourceType={sourceType} />

      {persisted && analysisId ? (
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <p className="text-muted-foreground text-sm">
            Saved to your tracker as a draft application.
          </p>
          <Button variant="outline" asChild>
            <Link href="/dashboard">View dashboard</Link>
          </Button>
        </div>
      ) : (
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <p className="text-muted-foreground text-sm">
            This run was not saved. Create an account to keep it and track the application.
          </p>
          <Button asChild>
            <Link href="/sign-up">Create account</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
