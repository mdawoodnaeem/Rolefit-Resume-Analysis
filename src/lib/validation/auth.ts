import { z } from 'zod'

/**
 * Auth validation schemas.
 *
 * These live outside the server-actions file on purpose: a module marked
 * `'use server'` may export *only* async functions, so a plain `const schema =
 * z.object(...)` there is a build error rather than a style problem. Keeping
 * them here also lets the client import the same rules if it ever wants to
 * validate before a round trip.
 */

export type AuthFormState = {
  ok: boolean
  /** Top-level message, shown in an alert. */
  error?: string
  /** Per-field messages, keyed by input name. */
  fieldErrors?: Partial<Record<'name' | 'email' | 'password', string>>
}

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'That name is too long'),
  email: z.email('Enter a valid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(200, 'That password is too long')
    // Length does far more for real-world strength than character-class rules,
    // which mostly push people towards Password1! — so this is the only
    // composition check, and it only rejects a single repeated character.
    .refine((value) => new Set(value).size > 1, 'Choose a less predictable password'),
})

export const signInSchema = z.object({
  email: z.email('Enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
})

/** Credentials-provider input, validated inside `authorize`. */
export const credentialsSchema = z.object({
  email: z.email('Enter a valid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export function fieldErrorsFrom(error: z.ZodError): AuthFormState['fieldErrors'] {
  const fieldErrors: AuthFormState['fieldErrors'] = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (key === 'name' || key === 'email' || key === 'password') {
      fieldErrors[key] ??= issue.message
    }
  }
  return fieldErrors
}
