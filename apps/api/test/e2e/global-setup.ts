// Runs once before the entire "e2e" Jest project. Provisions one
// dedicated tenant (separate from the integration project's tenant) with
// two users so critical-flow tests can exercise both the success path
// and PermissionsGuard's 403 path against real HTTP:
//   - an Owner (all permissions, via provisionTenant's seed-owner path —
//     the same path production uses on real tenant signup)
//   - a "no permissions" user on a freshly created, permission-less role
//     — inserted directly via Kysely here rather than through the real
//     RolesService/UsersService, since this is test *fixture* setup, not
//     itself something under test (the CRUD e2e tests below DO exercise
//     those services' own HTTP endpoints).
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { createTenantKyselyClient } from '../../src/database/tenant/kysely-client';
import { createTestTenant, mustGetTestDatabaseUrl } from '../support/test-tenant';

export const E2E_OWNER_EMAIL = 'owner@e2e-test.local';
export const E2E_OWNER_PASSWORD = 'Owner12345';
export const E2E_LIMITED_EMAIL = 'limited@e2e-test.local';
export const E2E_LIMITED_PASSWORD = 'Limited12345';

export default async function globalSetup(): Promise<void> {
  const tenant = await createTestTenant('e2e', {
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
    fullName: 'E2E Owner',
  });
  process.env.TEST_E2E_TENANT_SCHEMA = tenant.schemaName;
  process.env.TEST_E2E_TENANT_ID = tenant.tenantId;

  const db = createTenantKyselyClient(mustGetTestDatabaseUrl(), tenant.schemaName);
  try {
    const noPermissionsRoleId = randomUUID();
    await db
      .insertInto('roles')
      .values({ id: noPermissionsRoleId, name: 'No Permissions (e2e fixture)', is_system: false })
      .execute();
    // Deliberately no role_permissions rows inserted for this role — it
    // must have zero permissions, to exercise PermissionsGuard's 403 path.

    const passwordHash = await bcrypt.hash(E2E_LIMITED_PASSWORD, 12);
    await db
      .insertInto('users')
      .values({
        id: randomUUID(),
        email: E2E_LIMITED_EMAIL,
        password_hash: passwordHash,
        full_name: 'E2E Limited User',
        role_id: noPermissionsRoleId,
        is_active: true,
      })
      .execute();
  } finally {
    await db.destroy();
  }
}
