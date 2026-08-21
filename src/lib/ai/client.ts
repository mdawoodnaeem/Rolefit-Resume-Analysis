import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

import { PartialJsonAccumulator } from '@/lib/ai/partial-json'
import { env } from '@/lib/env'
import {
  MODEL_ID,
  STAGE_EFFORT,
  STAGE_MAX_TOKENS,
  computeCostUsd,
  type PipelineStage,
  type TokenUsage,
} from '@/lib/ai/models'

/* ------------------------------------------------------------------ errors */

export class AiRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(
      'The model declined this request. This can happen with content that trips a safety classifier — security or life-sciences resumes occasionally do.',
    )
    this.name = 'AiRefusalError'
  }
}

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    // `override` because Error already declares `cause`; noImplicitOverride
    // is on so shadowing it silently is a compile error.
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

export class AiSchemaError extends Error {
  constructor(
    readonly stage: PipelineStage,
    readonly issues: string[],
  ) {
    super(`Model output did not match the ${stage} schema: ${issues.join('; ')}`)
    this.name = 'AiSchemaError'
  }
}

/* ------------------------------------------------------------------ client */

let cached: Anthropic | null = null

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiUnavailableError(
      'ANTHROPIC_API_KEY is not set. The app should be running in demo mode — this is a bug in the caller, which should have checked demoModeEnabled first.',
    )
  }

  cached ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    // Our own retry loop below handles backoff, refusals, and usage logging.
    // Leaving the SDK's retries on as well would double the delays and hide
    // attempts from the cost log.
    maxRetries: 0,
    timeout: 10 * 60 * 1000,
  })

  return cached
}

/* ------------------------------------------------------------------- retry */

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529])

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true
  if (error instanceof Anthropic.APIError) return RETRYABLE_STATUS.has(error.status ?? 0)
  return false
}

/** Honour a server-supplied Retry-After before falling back to our own curve. */
function retryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof Anthropic.APIError) {
    const header = error.headers?.get?.('retry-after')
    const seconds = header ? Number(header) : Number.NaN
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000)
  }

  // Exponential with full jitter. Without the jitter, a burst of requests that
  // all hit the same 429 retries in lockstep and rebuilds the same spike.
  const ceiling = Math.min(1_000 * 2 ** attempt, 30_000)
  return Math.random() * ceiling
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ result */

export type AiCallResult<T> = {
  data: T
  usage: TokenUsage
  costUsd: number
  latencyMs: number
  attempts: number
  /** True when the prompt cache actually served part of the input. */
  cacheHit: boolean
}

export type StructuredCallOptions<S extends z.ZodType> = {
  stage: PipelineStage
  system: string
  user: string
  schema: S
  maxAttempts?: number
  signal?: AbortSignal
}

/**
 * One structured model call, with retry, cost accounting, and schema enforcement.
 *
 * Output shape is enforced by `output_config.format` rather than by asking for
 * JSON and parsing it — the model is constrained at decode time, so there is
 * no regex, no repair pass, and no "it returned markdown fences again" branch.
 *
 * The system prompt carries a cache breakpoint. It is identical across every
 * analysis, so from the second call onward it bills at 0.1x instead of 1x.
 * `cacheHit` reports whether that actually engaged: Opus 5 will not cache a
 * prefix below 512 tokens and does so silently, so this is the only way to
 * find out.
 */
export async function callStructured<S extends z.ZodType>({
  stage,
  system,
  user,
  schema,
  maxAttempts = 3,
  signal,
}: StructuredCallOptions<S>): Promise<AiCallResult<z.infer<S>>> {
  const client = getClient()
  const startedAt = Date.now()

  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await client.messages.parse(
        {
          model: MODEL_ID,
          max_tokens: STAGE_MAX_TOKENS[stage],
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: user }],
          output_config: {
            format: zodOutputFormat(schema),
            effort: STAGE_EFFORT[stage],
          },
        },
        { signal },
      )

      // Check stop_reason before touching content. A refusal returns HTTP 200
      // with an empty or partial content array, so anything that indexes
      // content[0] unconditionally throws a confusing TypeError instead of the
      // real reason.
      if (response.stop_reason === 'refusal') {
        throw new AiRefusalError(response.stop_details?.category ?? null)
      }

      if (response.stop_reason === 'max_tokens') {
        throw new AiUnavailableError(
          `The ${stage} stage hit its output limit. The input is probably too long — try a shorter resume.`,
        )
      }

      const parsed = response.parsed_output
      if (parsed == null) {
        throw new AiSchemaError(stage, ['model returned no parseable output'])
      }

      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      }

      return {
        data: parsed as z.infer<S>,
        usage,
        costUsd: computeCostUsd(usage),
        latencyMs: Date.now() - startedAt,
        attempts: attempt + 1,
        cacheHit: usage.cacheReadTokens > 0,
      }
    } catch (error) {
      lastError = error

      // A refusal is a decision, not a transient fault. Retrying an identical
      // request against the same classifier just burns latency.
      if (error instanceof AiRefusalError) throw error
      if (signal?.aborted) throw error

      if (!isRetryable(error) || attempt === maxAttempts - 1) break

      await sleep(retryDelayMs(error, attempt))
    }
  }

  if (lastError instanceof AiSchemaError) throw lastError

  throw new AiUnavailableError(
    `The ${stage} stage failed after ${maxAttempts} attempts.`,
    lastError,
  )
}

/* ---------------------------------------------------------------- streaming */

export type StreamEvent<T> =
  /** Best-effort value of the document so far. Safe to render, never to persist. */
  | { type: 'partial'; data: unknown }
  /** The validated, complete result. */
  | { type: 'complete'; result: AiCallResult<T> }

/**
 * Streamed structured call.
 *
 * The rewrite is the one stage worth streaming: it is the slowest, and it is
 * the one where the user is waiting to read prose rather than a number.
 *
 * Partial values come from `parsePartialJson`, which repairs a truncated
 * document for display. Those repairs are deliberately never what gets stored
 * — the final value is a real parse of the complete buffer, validated against
 * the schema. Persisting a repaired snapshot would mean saving a resume whose
 * last bullet had been silently closed mid-sentence.
 *
 * No retry loop here, unlike callStructured. A stream that fails halfway has
 * already emitted partial text to the user's screen; silently restarting it
 * would make the rewrite visibly rewind. The caller decides what to do.
 */
export async function* streamStructured<S extends z.ZodType>({
  stage,
  system,
  user,
  schema,
  signal,
}: Omit<StructuredCallOptions<S>, 'maxAttempts'>): AsyncGenerator<
  StreamEvent<z.infer<S>>,
  void,
  undefined
> {
  const client = getClient()
  const startedAt = Date.now()

  const stream = client.messages.stream(
    {
      model: MODEL_ID,
      max_tokens: STAGE_MAX_TOKENS[stage],
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: {
        format: zodOutputFormat(schema),
        effort: STAGE_EFFORT[stage],
      },
    },
    { signal },
  )

  const accumulator = new PartialJsonAccumulator()
  let lastEmitted: string | undefined

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue
    if (event.delta.type !== 'text_delta') continue

    const partial = accumulator.append(event.delta.text)
    if (partial === undefined) continue

    // Emit only on change. A delta that lands mid-token produces the same
    // repaired value as the previous one, and re-rendering the whole tree for
    // an identical value is pure waste at ~40 events a second.
    const fingerprint = JSON.stringify(partial)
    if (fingerprint === lastEmitted) continue
    lastEmitted = fingerprint

    yield { type: 'partial', data: partial }
  }

  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new AiRefusalError(message.stop_details?.category ?? null)
  }

  if (message.stop_reason === 'max_tokens') {
    throw new AiUnavailableError(
      `The ${stage} stage hit its output limit before finishing. Try a shorter resume.`,
    )
  }

  const raw = accumulator.final()
  const validated = schema.safeParse(raw)

  if (!validated.success) {
    throw new AiSchemaError(
      stage,
      validated.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }

  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  }

  yield {
    type: 'complete',
    result: {
      data: validated.data as z.infer<S>,
      usage,
      costUsd: computeCostUsd(usage),
      latencyMs: Date.now() - startedAt,
      attempts: 1,
      cacheHit: usage.cacheReadTokens > 0,
    },
  }
}

/** Exposed for tests. */
export const __testing = { isRetryable, retryDelayMs, RETRYABLE_STATUS }
