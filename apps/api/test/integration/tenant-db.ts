// Shared helper for *.int-spec.ts files: one Kysely client per test file,
// pointed at the shared integration tenant schema global-setup.ts
// provisioned. Call `close()` in an `afterAll` so the pg.Pool doesn't
// keep the Jest process alive after the suite finishes.
import type { Kysely } from 'kysely';
import { createTenantKyselyClient, type TenantDatabase } from '../../src/database/tenant/kysely-client';
import { mustGetTestDatabaseUrl } from '../support/test-tenant';

export function getIntegrationTenantSchema(): string {
  const schema = process.env.TEST_INTEGRATION_TENANT_SCHEMA;
  if (!schema) {
    throw new Error(
      'TEST_INTEGRATION_TENANT_SCHEMA is not set — this test must run under the "integration" ' +
        'Jest project (jest.config.js), whose globalSetup provisions it.',
    );
  }
  return schema;
}

export function openIntegrationDb(): Kysely<TenantDatabase> {
  return createTenantKyselyClient(mustGetTestDatabaseUrl(), getIntegrationTenantSchema());
}

/** Short random suffix for test-local unique values (codes, emails, keys). */
export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
