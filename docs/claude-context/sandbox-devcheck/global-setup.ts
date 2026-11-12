// Sandbox-only: provisions a tenant schema from the tenant migrations without Prisma.
import { Pool } from 'pg';
import { createTenantKyselyClient } from '../src/database/tenant/kysely-client';
import { loadTenantMigrations } from '../src/database/tenant/load-migrations';
import { ensureSchemaMigrationsTable } from '../src/database/tenant/schema-migrations';

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL!;
  const schema = `test_int_${Date.now()}`;
  const pool = new Pool({ connectionString: url });
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.end();
  const db = createTenantKyselyClient(url, schema);
  await ensureSchemaMigrationsTable(db);
  for (const m of loadTenantMigrations()) await m.up(db);
  await db.destroy();
  process.env.TEST_INTEGRATION_TENANT_SCHEMA = schema;
  process.env.TEST_INTEGRATION_TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
}
