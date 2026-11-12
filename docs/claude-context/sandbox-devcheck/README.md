# Sandbox integration-test harness (cloud only)

The integration tests normally provision tenants through Prisma, which can't be generated in the
Claude cloud sandbox. These three files run the same `test/integration/*.int-spec.ts` suites against
a real Postgres 16 without Prisma: the global setup creates one schema and applies every tenant
migration directly; `@prisma/client` is stubbed.

Use (in a cloud copy of the repo):

```
cp docs/claude-context/sandbox-devcheck/{global-setup.ts,jest.int.config.js,prisma-stub.js} apps/api/.devcheck/
cd apps/api
DATABASE_URL=postgres://postgres@localhost:5433/postgres npx jest -c .devcheck/jest.int.config.js
```

`apps/api/.devcheck/` is git-ignored on purpose — never run this config on the user's PC; there the
normal `pnpm test:integration` (with Prisma) applies. See START-HERE.md §8 for starting Postgres.
