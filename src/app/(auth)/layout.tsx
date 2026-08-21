import Link from 'next/link'

import { AuroraBackground } from '@/components/aurora-background'
import { Logo } from '@/components/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground />

      <header className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Link href="/" className="inline-flex rounded-md transition-opacity hover:opacity-80">
          <Logo />
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="glass w-full max-w-md rounded-3xl p-8 sm:p-9">{children}</div>
      </main>
    </div>
  )
}
