import { z } from 'zod'

import type { ResumeSourceType } from '@/generated/prisma/enums'
import type { ResumeDocument } from '@/lib/schemas/resume'
import type { CritiqueReport, DiffSegment } from '@/lib/schemas/tailored'
import type { AnalysisResult } from '@/server/pipeline/analyze'

/**
 * Shapes for the analyse flow.
 *
 * Separate from the actions file because a `'use server'` module may export
 * only async functions — a schema or a type alias there is a build error.
 */

export type ParseState =
  | { ok: true; text: string; sourceType: ResumeSourceType; filename?: string; warnings: string[] }
  | { ok: false; error: string; code?: string }
  | { ok: false; error?: undefined }

export type AnalyzeState =
  | { ok: true; analysis: AnalysisResult; persisted: boolean; analysisId?: string }
  | { ok: false; error: string; retryAfterSeconds?: number }
  | { ok: false; error?: undefined }

/**
 * Minimum lengths are set where a shorter input cannot produce a useful
 * answer, not where it becomes technically parseable. Scoring a three-line
 * "resume" would return a confident number derived from nothing.
 */
export const analyzeInputSchema = z.object({
  resumeText: z
    .string()
    .trim()
    .min(120, 'Your resume is too short to analyse — paste the full text, including experience.')
    .max(60_000, 'That resume is unusually long. Trim it to the relevant roles.'),
  jobText: z
    .string()
    .trim()
    .min(80, 'Paste the full job description, including its requirements.')
    .max(40_000, 'That job description is unusually long.'),
  sourceType: z.enum(['UPLOAD_PDF', 'UPLOAD_DOCX', 'PASTE']).catch('PASTE'),
})

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>

export type TailorState =
  | {
      ok: true
      diff: DiffSegment[]
      critique: CritiqueReport
      document: ResumeDocument
      rejectedCount: number
      demoMode: boolean
    }
  | { ok: false; error: string }
  | { ok: false; error?: undefined }

export const INITIAL_PARSE_STATE: ParseState = { ok: false }
export const INITIAL_ANALYZE_STATE: AnalyzeState = { ok: false }
export const INITIAL_TAILOR_STATE: TailorState = { ok: false }
