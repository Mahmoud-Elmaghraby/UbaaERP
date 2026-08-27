// Runs once before the entire "integration" Jest project. Provisions ONE
// shared, freshly migrated tenant schema that every *.int-spec.ts file
// runs its repository tests against — cheaper than one schema per file
// (provisioning applies every migration from scratch), while each test
// file still avoids collisions by using unique values (random suffixes on
// codes/emails/keys) for the rows it creates, and by cleaning up its own
// rows in afterAll. The schema name/id are handed to test files via
// process.env — the documented way to pass data out of a Jest
// globalSetup, since it runs in a separate context from the test files
// themselves (see https://jestjs.io/docs/configuration#globalsetup-string).
import 'dotenv/config';
import { createTestTenant } from '../support/test-tenant';

export default async function globalSetup(): Promise<void> {
  const tenant = await createTestTenant('integration');
  process.env.TEST_INTEGRATION_TENANT_SCHEMA = tenant.schemaName;
  process.env.TEST_INTEGRATION_TENANT_ID = tenant.tenantId;
}
