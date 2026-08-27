// Jest setupFiles entry, run once per worker before its test file loads.
// Reuses the exact same .env a developer already has for `pnpm start:dev`
// (DATABASE_URL, JWT_ACCESS_SECRET, ...) — no separate .env.test, since
// integration/e2e tests operate on their own freshly provisioned tenant
// schemas (see test-tenant.ts) and never touch a developer's existing
// tenant data. In CI, these same variables are set directly as workflow
// env vars instead of a committed .env file — dotenv/config silently
// no-ops when no .env file is present, so this works in both places.
import 'dotenv/config';
