import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'

import { ThemeScript } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

import './globals.css'

const SITE_NAME = 'RoleFit'
const SITE_DESCRIPTION =
  'Paste a job description, upload your resume, and get an honest match score, a tailored rewrite grounded in what you have actually done, and a gap analysis that tells you the truth.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: `${SITE_NAME} — Honest resume tailoring`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['resume', 'job application', 'ATS', 'resume tailoring', 'job match'],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Honest resume tailoring`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Honest resume tailoring`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfdfe' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0d11' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` is set here as well as by ThemeScript so the very first server-
    // rendered byte is already dark; the script then reconciles a stored
    // light preference before paint. suppressHydrationWarning covers the
    // class the script may have changed underneath React.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={cn(
          GeistSans.variable,
          GeistMono.variable,
          'bg-background text-foreground min-h-dvh font-sans antialiased',
        )}
      >
        <a
          href="#main"
          className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>

        {children}

        <Toaster
          position="bottom-right"
          closeButton
          richColors
          toastOptions={{ classNames: { toast: 'font-sans' } }}
        />
      </body>
    </html>
  )
}
