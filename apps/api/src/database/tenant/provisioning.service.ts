// Loaded first, as a side effect, before any other import: this CLI
// reads process.env.DATABASE_URL directly. Explicit rather than
// relying on @prisma/client's incidental auto-loading of .env (which
// some sibling CLI scripts happen to get as a side effect of
// importing PrismaClient, and this one doesn't import at all).
import 'dotenv/config';
import { Pool } from 'pg';
import type { PrismaClient } from '@prisma/client';
import { assertValidSchemaName } from './kysely-client';
import { applyPendingMigrationsForTenant } from './migration-runner.service';
import { seedOwnerUser } from './owner-seed';
import { seedWalkInCustomer } from './walk-in-customer-seed';
import { CORE_PLAN_KEY } from '../../shared/plans/feature-catalog';

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
  /** Optional: when provided, an Owner-role user is seeded once
   * migrations succeed (see owner-seed.ts) — without one, the tenant has
   * no way for anyone to log in until seeded separately (db:seed-owner). */
  owner?: {
    email: string;
    password: string;
    fullName: string;
  };
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

  // Assign the default "core" plan up front (seed-plans.command.ts must
  // have been run at least once per environment — see its own comment).
  // Not found is a soft warning, not a hard failure: PlanResolverService
  // treats a null planId as full access, so an unseeded environment
  // (e.g. a fresh local dev DB before the first `db:seed-plans` run)
  // still provisions a fully-working tenant, just without a plan row to
  // point at yet.
  const corePlan = await prisma.plan.findUnique({ where: { key: CORE_PLAN_KEY } });
  if (!corePlan) {
    console.warn(
      `[provisioning] no "${CORE_PLAN_KEY}" plan found (run "pnpm --filter api db:seed-plans" first) — ` +
        'provisioning this tenant with no plan assigned (full access, per PlanResolverService\'s fail-open default).',
    );
  }

  const tenant = await prisma.tenant.create({
    data: { name: input.name, schemaName: input.schemaName, planId: corePlan?.id },
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

  if (input.owner) {
    await seedOwnerUser(databaseUrl, {
      schemaName: input.schemaName,
      email: input.owner.email,
      password: input.owner.password,
      fullName: input.owner.fullName,
    });
    console.log(`[provisioning] seeded Owner user "${input.owner.email}" for "${input.schemaName}"`);
  }

  // POS feature Stage 2 (claude/sales-pos-research.md): every tenant gets
  // a system-default Walk-in Customer, regardless of whether an owner was
  // provided — unlike the owner, there's no meaningful "skip this" case.
  await seedWalkInCustomer(databaseUrl, input.schemaName);
  console.log(`[provisioning] seeded Walk-in Customer for "${input.schemaName}"`);

  console.log(`[provisioning] tenant "${input.schemaName}" (${tenant.id}) fully provisioned`);
  return { id: tenant.id, name: tenant.name, schemaName: tenant.schemaName };
}

if (require.main === module) {
  void (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const [name, schemaName, ownerEmail, ownerPassword, ownerFullName] = args;
    const databaseUrl = process.env.DATABASE_URL;

    if (!name || !schemaName) {
      console.error(
        'Usage: pnpm run db:provision -- "<Tenant Name>" <schema_name> ' +
          '[owner_email owner_password "Owner Full Name"]',
      );
      process.exit(1);
    }
    if (!databaseUrl) {
      console.error('[provisioning] DATABASE_URL is not set.');
      process.exit(1);
    }

    const owner =
      ownerEmail && ownerPassword && ownerFullName
        ? { email: ownerEmail, password: ownerPassword, fullName: ownerFullName }
        : undefined;

    const prisma = new PrismaClient();
    try {
      await provisionTenant(prisma, databaseUrl, { name, schemaName, owner });
    } catch (err) {
      console.error('[provisioning] fatal error:', err);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
