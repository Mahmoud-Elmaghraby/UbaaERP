import 'dotenv/config';
import { dropTestTenant } from '../support/test-tenant';

export default async function globalTeardown(): Promise<void> {
  const schemaName = process.env.TEST_E2E_TENANT_SCHEMA;
  const tenantId = process.env.TEST_E2E_TENANT_ID;
  if (!schemaName || !tenantId) return;
  await dropTestTenant({ schemaName, tenantId });
}
