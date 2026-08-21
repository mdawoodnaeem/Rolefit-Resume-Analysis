/**
 * Loaded before every test file.
 *
 * dotenv goes here rather than in individual specs because `src/lib/env.ts`
 * validates at import time and throws on anything missing. That is the right
 * behaviour for the app — a misconfigured deployment should fail at boot, not
 * three layers into a request — but it means any test that transitively
 * imports a server module needs the environment present first.
 */
import 'dotenv/config'

import '@testing-library/jest-dom/vitest'
