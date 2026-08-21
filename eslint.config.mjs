import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ESLint 9 flat config, composed from plugins directly.
 *
 * `eslint-config-next` is authored in the legacy eslintrc format, and running
 * it through FlatCompat under ESLint 9 throws "Converting circular structure
 * to JSON" from the eslintrc schema validator. Worse, `next build` swallowed
 * that throw as a warning and carried on, so the entire rule set was silently
 * not running. Composing the underlying plugins natively removes the compat
 * layer and the failure mode with it.
 */
export default [
  {
    ignores: [
      'src/generated/**',
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // `configs['recommended-latest']` is still eslintrc-shaped (plugins as an
  // array of strings); `configs.flat.recommended` is the flat-config export.
  reactHooks.configs.flat.recommended,

  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // The brief calls for full TypeScript strictness with no `any`. This is
      // the rule that actually enforces it.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Node-side CLI entry points: config, the seed, the local database
    // harness, and the e2e specs. Printing to the terminal is what these are
    // for, so the browser-oriented no-console rule does not apply.
    files: ['*.config.{ts,mjs}', 'prisma/**/*.ts', 'scripts/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]
