'use server'

import { unstable_rethrow } from 'next/navigation'

import { adminEmails } from '@/lib/env'
import {
  fieldErrorsFrom,
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from '@/lib/validation/auth'
import { hashPassword, signIn } from '@/server/auth'
import { db } from '@/server/db'

/**
 * A `'use server'` module may export only async functions — schemas and
 * helpers live in @/lib/validation/auth for that reason.
 */

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  const { name, email, password } = parsed.data

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    // Deliberately explicit rather than a vague "could not create account":
    // sign-up already reveals registration by its behaviour, and being coy
    // here just makes people retry the same address. Enumeration is mitigated
    // by rate limiting this route, not by an unhelpful message.
    return { ok: false, fieldErrors: { email: 'An account with this email already exists' } }
  }

  await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: adminEmails.has(email) ? 'ADMIN' : 'USER',
    },
  })

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
  } catch (error) {
    // signIn signals success by throwing a redirect — Next uses exceptions for
    // control flow, so swallowing everything would silently break the happy
    // path. unstable_rethrow re-throws framework errors and returns for the rest.
    unstable_rethrow(error)
    return { ok: false, error: 'Account created, but sign-in failed. Try signing in.' }
  }

  return { ok: true }
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' })
  } catch (error) {
    unstable_rethrow(error)
    // Never say which half was wrong — that turns the form into an account
    // enumeration oracle.
    return { ok: false, error: 'Email or password is incorrect' }
  }

  return { ok: true }
}
