// Shared test-tenant lifecycle helper for integration and e2e tests.
//
// Schema-per-tenant (CLAUDE.md §2.3) means a "real test database" for
// this project's testing strategy (CLAUDE.md §8) doesn't require a
// second Postgres instance — it means a real, freshly migrated tenant
// SCHEMA in the same instance, provisioned through the exact same
// provisionTenant() code path production uses (CLAUDE.md §3: "provisioning
// and migration share the same code path"). This helper wraps that so
// every integration/e2e test file provisions and tears down its own
// isolated schema instead of sharing mutable state across test files.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { provisionTenant, type ProvisionTenantInput } from '../../src/database/tenant/provisioning.service';

export interface ProvisionedTestTenant {
  tenantId: string;
  schemaName: string;
}

export function mustGetTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Integration/e2e tests need a real reachable Postgres ' +
        'instance (see .env.example / docker-compose.yml) — these tests are not mocked.',
    );
  }
  return url;
}

/**
 * Provisions a brand-new tenant schema with a random, collision-safe
 * name (test tenant schemas never collide with a developer's own
 * dev/demo tenants, and never collide with each other across parallel
 * Jest workers). `namePrefix` should be short and lowercase (e.g.
 * "branches", "auth-e2e") — it ends up embedded in the schema name,
 * purely to make a stuck/leaked schema identifiable during debugging.
 */
export async function createTestTenant(
  namePrefix: string,
  owner?: ProvisionTenantInput['owner'],
): Promise<ProvisionedTestTenant> {
  const databaseUrl = mustGetTestDatabaseUrl();
  const schemaName = `test_${namePrefix.replace(/[^a-z0-9]/g, '_')}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

  const prisma = new PrismaClient();
  try {
    const result = await provisionTenant(prisma, databaseUrl, {
      name: `Test Tenant (${namePrefix})`,
      schemaName,
      owner,
    });
    return { tenantId: result.id, schemaName: result.schemaName };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Drops a test tenant's schema and its public.tenants row. Safe to call
 * even if provisioning only partially succeeded (e.g. a migration
 * genuinely failed mid-test-run) — clears any migration_failures rows
 * first, since they FK-reference tenants.id.
 */
export async function dropTestTenant(tenant: ProvisionedTestTenant): Promise<void> {
  const databaseUrl = mustGetTestDatabaseUrl();

  const prisma = new PrismaClient();
  try {
    await prisma.migrationFailure.deleteMany({ where: { tenantId: tenant.tenantId } });
    await prisma.tenant.delete({ where: { id: tenant.tenantId } }).catch(() => undefined);
  } finally {
    await prisma.$disconnect();
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${tenant.schemaName}" CASCADE`);
  } finally {
    await pool.end();
  }
}
