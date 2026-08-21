'use server'

import { signIn } from '@/server/auth'

/**
 * Separate from the credentials actions because this one takes no form state —
 * it is a bare submit handler, and giving it the useActionState signature just
 * to share a file would be worse.
 */
export async function signInWithGitHub(): Promise<void> {
  await signIn('github', { redirectTo: '/dashboard' })
}
