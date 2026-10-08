// Loaded first: this CLI reads DATABASE_URL directly (same as the other db:* commands).
import 'dotenv/config';
import { Pool } from 'pg';
import { applyPublicMigrations } from '../public/public-migrations';
import { seedCorePlan } from '../public/seed-plans.command';
import { applyPendingMigrationsForTenant } from '../tenant/migration-runner.service';
import { provisionTenant } from '../tenant/provisioning.service';
import { getDesktopTenantSchema } from '../../shared/config/deployment';

/**
 * Desktop database setup — run by the installer after PostgreSQL is up, and
 * by the Electron app on every start before the API is spawned (so an
 * updated install picks up new migrations). Idempotent end to end:
 *
 *   1. wait for Postgres (the Windows service may still be starting)
 *   2. public schema: Prisma migrations (public-migrations.ts, no CLI)
 *   3. the "core" plan (upsert)
 *   4. the one fixed tenant (CLAUDE.md §2.3): provisioned on first run,
 *      otherwise brought up to date — the same code paths the cloud uses
 *      (provisionTenant / applyPendingMigrationsForTenant, §3).
 *
 * No user is created here: the Owner account is made on the app's
 * first-run screen (DesktopSetupService), so no password ships in the installer.
 *
 * Exit code 0 = ready; 1 = failed (message on stderr).
 */
export async function waitForDatabase(databaseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000 });
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
  throw new Error(`PostgreSQL did not become reachable within ${timeoutMs / 1000}s: ${(lastError as Error)?.message}`);
}

export async function runDesktopSetup(databaseUrl: string, companyName = 'الشركة'): Promise<void> {
  await waitForDatabase(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const { applied } = await applyPublicMigrations(pool);
    console.log(`[desktop-setup] public schema: ${applied.length ? `applied ${applied.join(', ')}` : 'up to date'}`);
  } finally {
    await pool.end();
  }

  await seedCorePlan();

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const schemaName = getDesktopTenantSchema();
    const tenant = await prisma.tenant.findUnique({ where: { schemaName } });
    if (!tenant) {
      await provisionTenant(prisma, databaseUrl, { name: companyName, schemaName });
      console.log(`[desktop-setup] provisioned tenant "${schemaName}"`);
      return;
    }
    const result = await applyPendingMigrationsForTenant(tenant, databaseUrl, prisma);
    if (!result.success) {
      throw new Error(`Tenant "${schemaName}" migrations failed — see migration_failures.`);
    }
    console.log(`[desktop-setup] tenant "${schemaName}" up to date`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('[desktop-setup] DATABASE_URL is not set.');
      process.exit(1);
    }
    try {
      await runDesktopSetup(databaseUrl, process.argv[2]);
    } catch (err) {
      console.error('[desktop-setup] failed:', (err as Error).message);
      process.exitCode = 1;
    }
  })();
}
