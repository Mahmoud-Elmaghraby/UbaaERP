/**
 * Root ESLint config for the erp-platform monorepo.
 *
 * Dependency-boundary enforcement (CLAUDE.md / master doc §11, 15.1):
 * kept intentionally minimal at foundation stage. Only two rules exist:
 *   1. libs/* must never import from apps/*
 *   2. apps/* must never import another app's source directly
 * Layer boundaries (domain -> application -> infrastructure -> presentation)
 * inside a business module are NOT enforced here yet, because no module
 * exists yet. That ruleset is added when the first module is implemented.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'boundaries/elements': [
      { type: 'app-api', pattern: 'apps/api/**' },
      { type: 'app-web', pattern: 'apps/web/**' },
      { type: 'app-desktop', pattern: 'apps/desktop/**' },
      { type: 'lib-contracts', pattern: 'libs/contracts/**' },
      { type: 'lib-shared-kernel', pattern: 'libs/shared-kernel/**' },
      { type: 'lib-ui', pattern: 'libs/ui/**' },
    ],
  },
  rules: {
    'boundaries/element-types': [
      2,
      {
        default: 'allow',
        rules: [
          {
            from: ['lib-contracts', 'lib-shared-kernel', 'lib-ui'],
            disallow: ['app-api', 'app-web', 'app-desktop'],
            message: 'libs/* must not import from apps/* (CLAUDE.md dependency direction).',
          },
          {
            from: ['app-api'],
            disallow: ['app-web', 'app-desktop'],
            message: 'apps must not import each other directly.',
          },
          {
            from: ['app-web'],
            disallow: ['app-api', 'app-desktop'],
            message: 'apps must not import each other directly.',
          },
          {
            from: ['app-desktop'],
            disallow: ['app-api', 'app-web'],
            message: 'apps must not import each other directly (desktop spawns/bundles them at build/runtime, not via source import).',
          },
        ],
      },
    ],
  },
  ignorePatterns: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/release/**',
    '*.config.js',
    '*.config.cjs',
  ],
};
