/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly its job in the app and exactly wrong under Vitest. Aliased to this
 * empty module in vitest.config.ts so server modules can be unit tested
 * directly, without weakening the guard in the real build.
 */
export {}
