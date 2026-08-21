import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth/auth-form'
import { githubOAuthEnabled } from '@/lib/env'
import { auth } from '@/server/auth'
import { signUpAction } from '@/server/actions/auth-actions'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignUpPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  return <AuthForm mode="sign-up" action={signUpAction} githubEnabled={githubOAuthEnabled} />
}
