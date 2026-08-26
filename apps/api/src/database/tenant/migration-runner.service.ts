import { randomUUID } from 'node:crypto';
import type { PrismaClient, Tenant } from '@prisma/client';
import { createTenantKyselyClient } from './kysely-client';
import { ensureSchemaMigrationsTable } from './schema-migrations';
import { loadTenantMigrations } from './load-migrations';

/**
 * Tenant Migration Runner (CLAUDE.md §3 [مستقر]).
 *
 * Iterates every tenant in public.tenants, applies pending Kysely migration
 * files (from ./migrations/, in filename order) to that tenant's own
 * schema, and tracks progress in a per-schema schema_migrations table.
 *
 * Partial-failure handling is the key requirement here: if a migration
 * fails for one tenant, the run must NOT abort — it records the failure
 * and continues to the next tenant (see runTenantMigrations below).
 *
 * applyPendingMigrationsForTenant is the shared per-tenant unit of work.
 * It's exported and reused as-is by provisioning.service.ts (new-tenant
 * provisioning runs the exact same logic against a freshly created empty
 * schema — "provisioning and migration share the same code path", §3) and
 * by retry-failed-migrations.command.ts (re-attempting only tenants with
 * recorded failures).
 */

type TenantForMigration = Pick<Tenant, 'id' | 'schemaName'>;

export interface ApplyMigrationsResult {
  success: boolean;
}

export async function applyPendingMigrationsForTenant(
  tenant: TenantForMigration,
  databaseUrl: string,
  prisma: PrismaClient,
): Promise<ApplyMigrationsResult> {
  const db = createTenantKyselyClient(databaseUrl, tenant.schemaName);

  try {
    await ensureSchemaMigrationsTable(db);

    const appliedRows = await db
      .selectFrom('schema_migrations')
      .select('migration_file')
      .execute();
    const appliedSet = new Set(appliedRows.map((row) => row.migration_file));

    const migrations = loadTenantMigrations();
    const pending = migrations.filter((migration) => !appliedSet.has(migration.name));

    for (const migration of pending) {
      try {
        await migration.up(db);
        await db
          .insertInto('schema_migrations')
          .values({
            id: randomUUID(),
            migration_file: migration.name,
            applied_at: new Date(),
          })
          .execute();
        console.log(
          `[migration-runner] tenant "${tenant.schemaName}" (${tenant.id}): applied "${migration.name}"`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[migration-runner] tenant "${tenant.schemaName}" (${tenant.id}) failed migration ` +
            `"${migration.name}": ${message}`,
        );
        // TODO: wire to a real alert channel (email/Slack webhook) once one
        // is chosen — CLAUDE.md §3 requires an alert here, deliberately
        // stubbed to a console.error + recorded row for this task.
        await prisma.migrationFailure.create({
          data: {
            tenantId: tenant.id,
            migrationFile: migration.name,
            error: message,
          },
        });
        return { success: false };
      }
    }

    return { success: true };
  } finally {
    await db.destroy();
  }
}

/**
 * Batch entry point: applies pending migrations to every tenant in
 * public.tenants. A failure for one tenant (recorded inside
 * applyPendingMigrationsForTenant) never aborts the batch — the loop
 * always continues to the next tenant (CLAUDE.md §3, partial-failure
 * handling).
 */
export async function runTenantMigrations(
  prisma: PrismaClient,
  databaseUrl: string,
): Promise<void> {
  const tenants = await prisma.tenant.findMany();
  console.log(`[migration-runner] found ${tenants.length} tenant(s)`);

  for (const tenant of tenants) {
    try {
      const result = await applyPendingMigrationsForTenant(tenant, databaseUrl, prisma);
      if (result.success) {
        console.log(`[migration-runner] tenant "${tenant.schemaName}" up to date`);
      }
    } catch (err) {
      // Defensive: applyPendingMigrationsForTenant already records ordinary
      // migration failures. This catches anything unexpected (e.g. a
      // connection error) so it still can't abort the whole batch.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[migration-runner] unexpected error for tenant "${tenant.schemaName}": ${message}`,
      );
    }
  }
}

if (require.main === module) {
  void (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('[migration-runner] DATABASE_URL is not set.');
      process.exit(1);
    }

    const prisma = new PrismaClient();
    try {
      await runTenantMigrations(prisma, databaseUrl);
    } catch (err) {
      console.error('[migration-runner] fatal error:', err);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
