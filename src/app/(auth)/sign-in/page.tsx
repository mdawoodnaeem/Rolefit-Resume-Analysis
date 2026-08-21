import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth/auth-form'
import { githubOAuthEnabled } from '@/lib/env'
import { auth } from '@/server/auth'
import { signInAction } from '@/server/actions/auth-actions'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  return <AuthForm mode="sign-in" action={signInAction} githubEnabled={githubOAuthEnabled} />
}
