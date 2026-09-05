/**
 * Jest config for @erp-platform/shared-kernel.
 *
 * Only ever unit tests here (CLAUDE.md §8) — this lib has no database
 * dependency by design, so there is no integration/e2e project to mirror
 * from apps/api/jest.config.js.
 */

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared-kernel',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};
