/**
 * Jest config for apps/api (CLAUDE.md §8 testing strategy):
 *   - unit: domain/application layer, no database, mocked repository ports.
 *   - integration: Kysely repositories against a real, freshly migrated
 *     tenant schema in the local/CI Postgres instance (see
 *     test/integration/global-setup.ts).
 *   - e2e: critical business flows only, driven through real HTTP against
 *     a full Nest application instance (see test/e2e/global-setup.ts).
 *
 * `pnpm test` (see package.json) runs all three projects — required on
 * every PR per CLAUDE.md §5. `test:unit`/`test:integration`/`test:e2e`
 * run one project at a time for faster local iteration.
 *
 * Uses tsconfig.spec.json (not tsconfig.json) so test/ files — outside
 * tsconfig.json's `rootDir: "src"` — type-check cleanly without changing
 * what the production `build`/`typecheck` scripts compile.
 */
const tsJestTransform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: tsJestTransform,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      transform: tsJestTransform,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.ts',
      globalTeardown: '<rootDir>/test/integration/global-teardown.ts',
      testTimeout: 20000,
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      transform: tsJestTransform,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
      globalSetup: '<rootDir>/test/e2e/global-setup.ts',
      globalTeardown: '<rootDir>/test/e2e/global-teardown.ts',
      testTimeout: 30000,
    },
  ],
};
