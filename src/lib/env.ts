import { z } from 'zod'

/**
 * Validated environment.
 *
 * Parsed once at module load so a missing or malformed variable fails at boot
 * with a readable list, rather than as `undefined` surfacing three layers deep
 * in a request handler at 2am.
 *
 * The optional/required split is the product's demo-mode promise expressed as
 * types: only the database and an auth secret are required. Without an
 * Anthropic key the app serves fixture-backed analyses; without GitHub
 * credentials the OAuth button hides itself. A fresh clone boots and the whole
 * flow is clickable.
 */

const booleanish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((value) => value === 'true' || value === '1')

const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback)

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required — see .env.example'),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters. Generate: openssl rand -base64 32'),

  ANTHROPIC_API_KEY: z.string().optional(),

  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  ROLEFIT_FORCE_DEMO_MODE: booleanish.default(false),
  ROLEFIT_FREE_MONTHLY_ANALYSES: positiveInt(5),
  ROLEFIT_AI_RATE_LIMIT_PER_MINUTE: positiveInt(6),
  ROLEFIT_ADMIN_EMAILS: z.string().default(''),
})

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`Invalid environment configuration:\n${issues}\n`)
  }

  return parsed.data
}

export const env = parseServerEnv()

/** GitHub OAuth is only wired up when both halves of the credential exist. */
export const githubOAuthEnabled = Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)

/**
 * True when analyses should come from fixtures instead of the live API.
 *
 * Either because no key is configured, or because a deployment explicitly
 * forces it — which is what you want on a public demo, so visitors cannot
 * spend your credits.
 */
export const demoModeEnabled = env.ROLEFIT_FORCE_DEMO_MODE || !env.ANTHROPIC_API_KEY

export const adminEmails: ReadonlySet<string> = new Set(
  env.ROLEFIT_ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

export const isProduction = env.NODE_ENV === 'production'
