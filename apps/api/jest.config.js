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
 *
 * `kysely` (used throughout src/database/tenant/) ships as a pure ESM
 * package — no CommonJS build at all (package.json: "type": "module",
 * "main": "dist/index.js" containing `export * from './kysely.js'`).
 * Jest's default CommonJS runtime can't `require()` that without help:
 * `transformIgnorePatterns` normally skips all of node_modules, so
 * kysely's ESM source reaches Node's CJS loader untransformed and blows
 * up on the bare `export` keyword. Fix: let kysely through the transform
 * (transformIgnorePatterns below) and let ts-jest transpile it too —
 * isolatedModules + allowJs so ts-jest treats it as file-by-file
 * transpilation (ESM import/export -> CJS) rather than full type-checked
 * compilation, since kysely's .js is plainly outside this project's own
 * tsconfig `include`.
 *
 * The transformIgnorePatterns regex below is NOT the textbook
 * `'/node_modules/(?!(kysely)/)'` example from Jest's own docs — that
 * one breaks under pnpm. pnpm nests every package as
 * `node_modules/.pnpm/kysely@X.Y.Z/node_modules/kysely/...`, i.e. the
 * literal string "node_modules/" appears TWICE in kysely's real path.
 * `.test()` tries every start position in the string, and the *first*
 * "node_modules/" occurrence (right before ".pnpm/...") is NOT
 * immediately followed by "kysely/", so the textbook pattern matches
 * (= ignored = NOT transformed) right there — the second, correct
 * occurrence never gets a chance to override that. Confirmed by
 * reproducing the exact "Unexpected token 'export'" failure with the
 * textbook pattern against this repo's real pnpm-nested kysely path,
 * then fixing it with the lookahead below (which checks for a "kysely/"
 * segment anywhere in the remainder of the path, not just immediately
 * after "node_modules/") and re-confirming the same import parses
 * cleanly. Verified directly against this project's real
 * `node_modules/.pnpm/kysely@.../node_modules/kysely/...` layout, not
 * just in the abstract.
 */
const tsJestTransform = {
  '^.+\\.[tj]sx?$': [
    'ts-jest',
    {
      // isolatedModules lives in tsconfig.spec.json now (ts-jest's own
      // "isolatedModules" transform option is deprecated as of ts-jest
      // 29, removed in 30 — see tsconfig.spec.json's compilerOptions).
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  ],
};

const transformIgnorePatterns = ['node_modules/(?!(?:.*/)?kysely/)'];

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: tsJestTransform,
      transformIgnorePatterns,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      transform: tsJestTransform,
      transformIgnorePatterns,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/integration/jest-timeout-setup.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.ts',
      globalTeardown: '<rootDir>/test/integration/global-teardown.ts',
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      transform: tsJestTransform,
      transformIgnorePatterns,
      setupFiles: ['<rootDir>/test/support/load-env.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/e2e/jest-timeout-setup.ts'],
      globalSetup: '<rootDir>/test/e2e/global-setup.ts',
      globalTeardown: '<rootDir>/test/e2e/global-teardown.ts',
    },
  ],
};
