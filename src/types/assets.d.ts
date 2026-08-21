/**
 * Ambient declarations for non-code imports.
 *
 * TypeScript 6 will not resolve a side-effect import of a stylesheet on its
 * own, and `next-env.d.ts` does not cover it, so `import './globals.css'` in
 * the root layout fails typecheck without this. Declaring the modules with no
 * shape is correct: these imports exist for their side effects and never
 * produce a value we read.
 */
declare module '*.css'
declare module '*.scss'

declare module '*.svg' {
  import type * as React from 'react'

  const content: React.FC<React.SVGProps<SVGSVGElement>>
  export default content
}
