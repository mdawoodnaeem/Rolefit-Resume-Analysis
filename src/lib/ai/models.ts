/**
 * Model selection and pricing.
 *
 * One file so a model change is one diff, and so the cost table cannot drift
 * away from the model actually being called.
 *
 * Everything runs on Claude Opus 5. A cheaper model for the extraction stages
 * was considered and rejected: output tokens dominate the bill and stages 03
 * and 04 stay on Opus regardless, so the realistic saving was roughly $0.31 to
 * $0.24 per analysis — not enough to justify two model behaviours, two sets of
 * prompt tuning, and two failure modes to reason about.
 */

export const MODEL_ID = 'claude-opus-5' as const

export type PipelineStage =
  | 'extractResume'
  | 'extractJob'
  | 'scoreAndGaps'
  | 'rewrite'
  | 'critique'

/**
 * Effort per stage.
 *
 * Opus 5 respects effort strictly, and it is the primary cost and latency
 * lever. Extraction is transcription, so it runs low — at higher effort the
 * model starts "improving" what it reads, which is actively harmful here
 * because later stages treat stage 01's output as the source of truth.
 * Judgement stages run high.
 */
export const STAGE_EFFORT: Record<PipelineStage, 'low' | 'medium' | 'high'> = {
  extractResume: 'low',
  extractJob: 'low',
  scoreAndGaps: 'high',
  rewrite: 'high',
  critique: 'high',
}

/**
 * Output ceilings.
 *
 * Thinking is on by default on Opus 5 and `max_tokens` caps thinking *plus*
 * response text together, so these are sized for both. Setting them tight
 * around the expected answer is how a response truncates mid-thought.
 */
export const STAGE_MAX_TOKENS: Record<PipelineStage, number> = {
  extractResume: 16_000,
  extractJob: 12_000,
  scoreAndGaps: 24_000,
  rewrite: 24_000,
  critique: 20_000,
}

/** Published Claude Opus 5 rates, USD per million tokens. */
export const PRICING = {
  input: 5,
  output: 25,
  /** Cache reads bill at 0.1x input. */
  cacheRead: 0.5,
  /** Cache writes bill at 1.25x input for the default 5-minute TTL. */
  cacheWrite: 6.25,
} as const

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/**
 * Cost for one call.
 *
 * The four token classes are priced separately rather than summed, because
 * they differ by a factor of twelve. Collapsing cache reads into plain input —
 * which is what happens if you only read `usage.input_tokens` — overstates
 * spend by roughly 5x on a warm cache and makes the whole usage dashboard
 * fiction.
 */
export function computeCostUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens / 1_000_000) * PRICING.input +
    (usage.outputTokens / 1_000_000) * PRICING.output +
    (usage.cacheReadTokens / 1_000_000) * PRICING.cacheRead +
    (usage.cacheWriteTokens / 1_000_000) * PRICING.cacheWrite
  )
}

export function totalTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  )
}

/** Maps a pipeline stage to the AiOperation enum stored in UsageLog. */
export const STAGE_TO_OPERATION = {
  extractResume: 'EXTRACT_RESUME',
  extractJob: 'EXTRACT_JOB',
  scoreAndGaps: 'SCORE_AND_GAPS',
  rewrite: 'REWRITE',
  critique: 'CRITIQUE',
} as const satisfies Record<PipelineStage, string>
