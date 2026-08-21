'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

import { GitHubIcon } from '@/components/icons/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signInWithGitHub } from '@/server/actions/oauth-actions'
import type { AuthFormState } from '@/lib/validation/auth'

type Mode = 'sign-in' | 'sign-up'

type AuthFormProps = {
  mode: Mode
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>
  githubEnabled: boolean
}

const INITIAL: AuthFormState = { ok: false }

export function AuthForm({ mode, action, githubEnabled }: AuthFormProps) {
  const [state, formAction, pending] = React.useActionState(action, INITIAL)
  const isSignUp = mode === 'sign-up'

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isSignUp ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {isSignUp
          ? 'Five analyses a month, free. No card required.'
          : 'Sign in to pick up where you left off.'}
      </p>

      {githubEnabled ? (
        <>
          <form action={signInWithGitHub} className="mt-7">
            <Button type="submit" variant="outline" className="glass-subtle w-full" size="lg">
              <GitHubIcon className="size-4" />
              Continue with GitHub
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      ) : null}

      <form action={formAction} className={githubEnabled ? 'space-y-4' : 'mt-7 space-y-4'}>
        {state.error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        ) : null}

        {isSignUp ? (
          <Field
            id="name"
            name="name"
            label="Name"
            type="text"
            autoComplete="name"
            error={state.fieldErrors?.name}
            required
          />
        ) : null}

        <Field
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
          required
        />

        <Field
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          hint={isSignUp ? 'At least 8 characters.' : undefined}
          error={state.fieldErrors?.password}
          required
        />

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <Link
          href={isSignUp ? '/sign-in' : '/sign-up'}
          className="text-foreground rounded font-medium underline-offset-4 hover:underline"
        >
          {isSignUp ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </div>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<'input'> & { id: string; label: string; error?: string; hint?: string }) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        // Point at whichever description exists so the field is never
        // announced with a dangling reference.
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
