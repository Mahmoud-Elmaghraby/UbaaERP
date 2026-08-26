import { Pool } from 'pg';
import type { PrismaClient } from '@prisma/client';
import { assertValidSchemaName } from './kysely-client';
import { applyPendingMigrationsForTenant } from './migration-runner.service';

/**
 * Tenant Provisioning (CLAUDE.md §3 [مستقر]).
 *
 * On new-tenant signup: create the public.tenants record, create a fresh
 * empty Postgres schema, then apply ALL tenant migrations from scratch.
 * There is no separate "template schema" — this reuses the exact same
 * per-tenant migration logic as the batch migration runner
 * (applyPendingMigrationsForTenant), by design ("provisioning and
 * migration share the same code path", §3).
 *
 * Ordering choice (not specified by the master document — flagged here as
 * an implementation decision, not a master-doc rule): the tenant record is
 * created BEFORE the schema is created/migrated. This lets schema_name
 * uniqueness be enforced immediately at the database level (the Prisma
 * @unique constraint on Tenant.schemaName), and it's safe if migration
 * fails partway: the tenant row stays with a partially-migrated schema,
 * a migration_failures row is recorded (same as the batch runner), and the
 * next ordinary runTenantMigrations() batch run will pick this tenant up
 * and apply exactly the remaining pending migrations — idempotent via
 * schema_migrations. No manual cleanup step is required for this case.
 */
export interface ProvisionTenantInput {
  name: string;
  schemaName: string;
}

export interface ProvisionTenantResult {
  id: string;
  name: string;
  schemaName: string;
}

export async function provisionTenant(
  prisma: PrismaClient,
  databaseUrl: string,
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  assertValidSchemaName(input.schemaName);

  const existing = await prisma.tenant.findUnique({
    where: { schemaName: input.schemaName },
  });
  if (existing) {
    throw new Error(`A tenant with schema_name "${input.schemaName}" already exists.`);
  }

  const tenant = await prisma.tenant.create({
    data: { name: input.name, schemaName: input.schemaName },
  });
  console.log(`[provisioning] created tenant record "${tenant.schemaName}" (${tenant.id})`);

  // The schema must exist before a search_path-scoped Kysely client (or
  // ensureSchemaMigrationsTable) can do anything useful. Created here with
  // a plain, schema-less connection. input.schemaName was already
  // validated above (assertValidSchemaName) before being interpolated into
  // this DDL statement.
  const bootstrapPool = new Pool({ connectionString: databaseUrl });
  try {
    await bootstrapPool.query(`CREATE SCHEMA IF NOT EXISTS "${input.schemaName}"`);
  } finally {
    await bootstrapPool.end();
  }
  console.log(`[provisioning] created schema "${input.schemaName}", applying migrations...`);

  const result = await applyPendingMigrationsForTenant(tenant, databaseUrl, prisma);

  if (!result.success) {
    throw new Error(
      `Provisioning failed while migrating tenant "${input.schemaName}" (${tenant.id}). ` +
        'The tenant record and partially-migrated schema were kept (not rolled back). ' +
        'The failure was recorded in migration_failures; the next scheduled ' +
        'runTenantMigrations() run, or db:migrate:retry, will resume from where it stopped.',
    );
  }

  console.log(`[provisioning] tenant "${input.schemaName}" (${tenant.id}) fully provisioned`);
  return { id: tenant.id, name: tenant.name, schemaName: tenant.schemaName };
}

if (require.main === module) {
  void (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const [name, schemaName] = args;
    const databaseUrl = process.env.DATABASE_URL;

    if (!name || !schemaName) {
      console.error('Usage: pnpm run db:provision -- "<Tenant Name>" <schema_name>');
      process.exit(1);
    }
    if (!databaseUrl) {
      console.error('[provisioning] DATABASE_URL is not set.');
      process.exit(1);
    }

    const prisma = new PrismaClient();
    try {
      await provisionTenant(prisma, databaseUrl, { name, schemaName });
    } catch (err) {
      console.error('[provisioning] fatal error:', err);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
