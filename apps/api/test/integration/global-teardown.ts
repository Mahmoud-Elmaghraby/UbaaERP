import 'dotenv/config';
import { dropTestTenant } from '../support/test-tenant';

export default async function globalTeardown(): Promise<void> {
  const schemaName = process.env.TEST_INTEGRATION_TENANT_SCHEMA;
  const tenantId = process.env.TEST_INTEGRATION_TENANT_ID;
  if (!schemaName || !tenantId) return; // global-setup failed before creating it — nothing to drop.
  await dropTestTenant({ schemaName, tenantId });
}
