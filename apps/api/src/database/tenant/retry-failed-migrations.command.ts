import type { PrismaClient } from '@prisma/client';
import { createTenantKyselyClient } from './kysely-client';
import { applyPendingMigrationsForTenant } from './migration-runner.service';

/**
 * retry-failed-migrations (CLAUDE.md §3 [مستقر]):
 * "A separate retry-failed-migrations command re-attempts only the
 * tenants recorded as failed."
 *
 * Reuses the same per-tenant migration logic as the batch runner
 * (applyPendingMigrationsForTenant) — idempotent via schema_migrations, so
 * migrations already applied (including ones fixed manually in the
 * meantime) are simply skipped, not re-run.
 *
 * Resolution semantics: failure rows are never deleted, only marked
 * resolved (resolvedAt), preserving an audit trail. After re-attempting a
 * tenant, every one of its previously-unresolved failure rows whose
 * migration_file now appears in that tenant's schema_migrations table is
 * marked resolved — including rows from a prior run, if this run's
 * progress finally got past them. If the tenant fails again further down
 * the pending list, applyPendingMigrationsForTenant records a new failure
 * row as usual; already-resolved rows are unaffected.
 */
export async function retryFailedMigrations(
  prisma: PrismaClient,
  databaseUrl: string,
): Promise<void> {
  const unresolved = await prisma.migrationFailure.findMany({
    where: { resolvedAt: null },
    include: { tenant: true },
  });

  if (unresolved.length === 0) {
    console.log('[retry-failed-migrations] no unresolved migration failures.');
    return;
  }

  const tenantIds = [...new Set(unresolved.map((failure) => failure.tenantId))];
  console.log(
    `[retry-failed-migrations] retrying ${tenantIds.length} tenant(s) with unresolved failures`,
  );

  for (const tenantId of tenantIds) {
    const failuresForTenant = unresolved.filter((failure) => failure.tenantId === tenantId);
    const tenant = failuresForTenant[0].tenant;

    console.log(
      `[retry-failed-migrations] retrying tenant "${tenant.schemaName}" (${tenant.id})`,
    );

    await applyPendingMigrationsForTenant(tenant, databaseUrl, prisma);

    const db = createTenantKyselyClient(databaseUrl, tenant.schemaName);
    try {
      const appliedRows = await db
        .selectFrom('schema_migrations')
        .select('migration_file')
        .execute();
      const appliedSet = new Set(appliedRows.map((row) => row.migration_file));

      for (const failure of failuresForTenant) {
        if (appliedSet.has(failure.migrationFile)) {
          await prisma.migrationFailure.update({
            where: { id: failure.id },
            data: { resolvedAt: new Date() },
          });
          console.log(
            `[retry-failed-migrations] resolved: tenant "${tenant.schemaName}", ` +
              `migration "${failure.migrationFile}"`,
          );
        }
      }
    } finally {
      await db.destroy();
    }
  }
}

if (require.main === module) {
  void (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('[retry-failed-migrations] DATABASE_URL is not set.');
      process.exit(1);
    }

    const prisma = new PrismaClient();
    try {
      await retryFailedMigrations(prisma, databaseUrl);
    } catch (err) {
      console.error('[retry-failed-migrations] fatal error:', err);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
