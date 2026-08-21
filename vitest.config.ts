import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@prompts': fileURLToPath(new URL('./prompts', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // The default `forks` pool fails to hand off to its worker when the
    // project path contains a space (the worker receives a URL-encoded path
    // and cannot resolve modules from it), which this checkout does.
    // `threads` shares the parent's resolver and is unaffected.
    pool: 'threads',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // The generated Prisma client is large and has no tests of its own.
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'src/generated/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
      exclude: ['src/generated/**', '**/*.d.ts'],
    },
  },
})
