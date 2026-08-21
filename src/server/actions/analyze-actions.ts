'use server'

import { headers } from 'next/headers'

import { demoModeEnabled } from '@/lib/env'
import {
  analyzeInputSchema,
  type AnalyzeState,
  type ParseState,
  type TailorState,
} from '@/lib/validation/analyze'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import {
  MAX_FILE_BYTES,
  ResumeParseError,
  parsePastedResume,
  parseResumeFile,
} from '@/server/ingest/parse-resume'
import { runAnalysis, runTailoring } from '@/server/pipeline/analyze'
import { QuotaExceededError, assertWithinQuota } from '@/server/quota'
import { consumeToken, rateLimitKey } from '@/server/rate-limit'
import { AiRefusalError, AiSchemaError, AiUnavailableError } from '@/lib/ai/client'

/**
 * Server actions for the analyse flow.
 *
 * Anonymous visitors are allowed through deliberately — the landing page
 * promises "try it, no signup", and a portfolio piece that demands an account
 * before showing anything is a portfolio piece nobody looks at. They run in
 * demo mode, are rate limited by IP, and nothing is persisted for them.
 */

/** Best-effort client IP for anonymous rate limiting. */
async function clientIp(): Promise<string> {
  const headerList = await headers()

  // x-forwarded-for is a comma-separated chain; the first entry is the client
  // as seen by the outermost proxy. Vercel sets x-real-ip too.
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headerList.get('x-real-ip') || 'unknown'
}

/* ----------------------------------------------------------------- parsing */

export async function parseResumeAction(
  _prev: ParseState,
  formData: FormData,
): Promise<ParseState> {
  const file = formData.get('file')
  const pasted = formData.get('text')

  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        return { ok: false, error: `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024}MB.` }
      }

      const parsed = await parseResumeFile(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
      )

      return {
        ok: true,
        text: parsed.text,
        sourceType: parsed.sourceType,
        filename: file.name,
        warnings: parsed.warnings,
      }
    }

    if (typeof pasted === 'string' && pasted.trim()) {
      const parsed = parsePastedResume(pasted)
      return { ok: true, text: parsed.text, sourceType: 'PASTE', warnings: [] }
    }

    return { ok: false, error: 'Upload a PDF or DOCX, or paste your resume text.' }
  } catch (error) {
    if (error instanceof ResumeParseError) {
      return { ok: false, error: error.message, code: error.code }
    }

    return {
      ok: false,
      error: 'That file could not be read. Try pasting the text instead.',
    }
  }
}

/* --------------------------------------------------------------- analysing */

export async function runAnalysisAction(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  const parsed = analyzeInputSchema.safeParse({
    resumeText: formData.get('resumeText'),
    jobText: formData.get('jobText'),
    sourceType: formData.get('sourceType'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Check your inputs and try again.' }
  }

  const { resumeText, jobText, sourceType } = parsed.data
  const session = await auth()
  const user = session?.user ?? null

  // Rate limit before doing any work. Keyed by user when signed in so one
  // person on a shared office IP cannot lock out their colleagues.
  const limitKey = user
    ? rateLimitKey('user', user.id)
    : rateLimitKey('ip', await clientIp())

  const limit = await consumeToken(limitKey)
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many analyses in a short window. Try again in ${limit.retryAfterSeconds} seconds.`,
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  try {
    if (user) {
      await assertWithinQuota(user.id, user.plan)
    }

    const result = await runAnalysis(resumeText, jobText, {
      // Anonymous runs are never billed to a real account and never persisted.
      userId: user?.id ?? 'anonymous',
      forceDemo: !user || demoModeEnabled,
    })

    if (!user) {
      return { ok: true, analysis: result, persisted: false }
    }

    const analysisId = await persistAnalysis(user.id, resumeText, jobText, sourceType, result)
    return { ok: true, analysis: result, persisted: true, analysisId }
  } catch (error) {
    return { ok: false, ...describeFailure(error) }
  }
}

/* --------------------------------------------------------------- tailoring */

/**
 * Rewrite, then check the rewrite.
 *
 * Takes the raw texts rather than a serialised analysis. The analysis is
 * already in the content-addressed cache from the scoring step, so re-running
 * `runAnalysis` here is a cache read costing nothing — and it avoids shipping
 * a large object through a form round trip only to hand it straight back.
 *
 * It also means this works for anonymous users, who have no persisted analysis
 * to look up by id.
 */
export async function runTailorAction(
  _prev: TailorState,
  formData: FormData,
): Promise<TailorState> {
  const parsed = analyzeInputSchema.safeParse({
    resumeText: formData.get('resumeText'),
    jobText: formData.get('jobText'),
    sourceType: formData.get('sourceType'),
  })

  if (!parsed.success) {
    return { ok: false, error: 'The resume or job description is missing. Re-run the analysis.' }
  }

  const session = await auth()
  const user = session?.user ?? null

  const limit = await consumeToken(
    user ? rateLimitKey('user', user.id) : rateLimitKey('ip', await clientIp()),
  )

  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many requests in a short window. Try again in ${limit.retryAfterSeconds} seconds.`,
    }
  }

  try {
    const options = {
      userId: user?.id ?? 'anonymous',
      forceDemo: !user || demoModeEnabled,
    }

    const analysis = await runAnalysis(parsed.data.resumeText, parsed.data.jobText, options)
    const tailored = await runTailoring(analysis, options)

    return {
      ok: true,
      diff: tailored.diff,
      critique: tailored.critique,
      document: tailored.document,
      rejectedCount: tailored.rejectedCount,
      demoMode: tailored.demoMode,
    }
  } catch (error) {
    return { ok: false, ...describeFailure(error) }
  }
}

/**
 * Turn a pipeline failure into something a person can act on.
 *
 * Every branch names what happened and what to do next. "Something went wrong"
 * is the message that makes people close the tab.
 */
function describeFailure(error: unknown): { error: string; retryAfterSeconds?: number } {
  if (error instanceof QuotaExceededError) {
    return {
      error: `You have used all ${error.status.limit} analyses this month. Your allowance resets on ${error.status.resetsAt.toISOString().slice(0, 10)}.`,
    }
  }

  if (error instanceof AiRefusalError) {
    return {
      error:
        'The model declined to analyse this content. That occasionally happens with security or life-sciences material. Editing the wording usually clears it.',
    }
  }

  if (error instanceof AiSchemaError) {
    return {
      error:
        'The analysis came back in an unexpected shape and was rejected rather than shown to you. Please try again.',
    }
  }

  if (error instanceof AiUnavailableError) {
    return { error: error.message }
  }

  return { error: 'The analysis failed. Please try again.' }
}

async function persistAnalysis(
  userId: string,
  resumeText: string,
  jobText: string,
  sourceType: 'UPLOAD_PDF' | 'UPLOAD_DOCX' | 'PASTE',
  result: Awaited<ReturnType<typeof runAnalysis>>,
): Promise<string> {
  // One transaction: an Analysis row pointing at a ResumeVersion that does not
  // exist is worse than no row at all.
  return db.$transaction(async (tx) => {
    const resume = await tx.resume.upsert({
      where: { id: `${userId}-default` },
      create: { id: `${userId}-default`, userId, title: 'My resume', isDefault: true },
      update: { updatedAt: new Date() },
    })

    const lastVersion = await tx.resumeVersion.findFirst({
      where: { resumeId: resume.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true, rawText: true },
    })

    // Only cut a new version when the text actually changed. Re-analysing the
    // same resume against five postings should not create five versions.
    const version =
      lastVersion?.rawText === resumeText
        ? await tx.resumeVersion.findFirstOrThrow({
            where: { resumeId: resume.id, versionNumber: lastVersion.versionNumber },
          })
        : await tx.resumeVersion.create({
            data: {
              resumeId: resume.id,
              versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
              sourceType,
              rawText: resumeText,
              structured: result.resume,
              charCount: resumeText.length,
              tokenEstimate: Math.ceil(resumeText.length / 4),
            },
          })

    const job = await tx.jobDescription.create({
      data: {
        userId,
        sourceType: 'PASTE',
        rawText: jobText,
        structured: result.job,
        contentHash: result.cacheKey,
      },
    })

    const analysis = await tx.analysis.create({
      data: {
        userId,
        resumeVersionId: version.id,
        jobDescriptionId: job.id,
        resumeSnapshot: result.resume,
        jobSnapshot: result.job,
        status: 'COMPLETE',
        overallScore: result.report.overallScore,
        subScores: result.report.subScores,
        gaps: result.report.gaps,
        keywords: result.keywords,
        modelId: result.demoMode ? 'demo' : 'claude-opus-5',
        cacheKey: result.cacheKey,
        cacheHit: result.cacheHit,
        demoMode: result.demoMode,
        completedAt: new Date(),
      },
    })

    await tx.application.create({
      data: {
        userId,
        analysisId: analysis.id,
        company: result.job.company || 'Unknown company',
        roleTitle: result.job.title,
        location: result.job.location || null,
        status: 'DRAFT',
        matchScoreSnapshot: result.report.overallScore,
      },
    })

    return analysis.id
  })
}
