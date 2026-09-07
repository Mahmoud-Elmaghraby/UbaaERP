import { randomUUID } from 'node:crypto';
import { createTenantKyselyClient } from './kysely-client';

export interface SeedWalkInCustomerResult {
  id: string;
  code: string;
}

const WALK_IN_CUSTOMER_CODE = 'WALK-IN';

/**
 * Seeds the system-default "Walk-in Customer" (POS feature Stage 2,
 * claude/sales-pos-research.md) into a tenant schema — POS defaults new
 * sales to this customer so a cashier isn't forced to pick a real one
 * every sale. `is_system_default = true` (migration 0063) marks it
 * non-deletable (CustomersService.delete() rejects it) and the partial
 * UNIQUE index enforces at most one such row per tenant. Used both by
 * provisionTenant() (new tenants) and the standalone
 * db:seed-walk-in-customer CLI (for a tenant provisioned before this
 * stage existed — e.g. any tenant provisioned before this migration).
 *
 * Idempotent, unlike seedOwnerUser(): if a system-default customer
 * already exists, this returns it unchanged rather than erroring — safe
 * to re-run against an already-provisioned tenant.
 */
export async function seedWalkInCustomer(databaseUrl: string, schemaName: string): Promise<SeedWalkInCustomerResult> {
  const db = createTenantKyselyClient(databaseUrl, schemaName);
  try {
    const existing = await db
      .selectFrom('customers')
      .select(['id', 'code'])
      .where('is_system_default', '=', true)
      .executeTakeFirst();
    if (existing) return existing;

    // tenant_settings may not have a row yet this early (its own
    // getOrCreate() only runs on first API access) — its currency_code
    // column defaults to 'EGP' (migration 0001), so that's the fallback
    // here too when no row exists.
    const settings = await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst();
    const currency = settings?.currency_code ?? 'EGP';

    const row = await db
      .insertInto('customers')
      .values({
        id: randomUUID(),
        name: 'Walk-in Customer / عميل نقدي',
        code: WALK_IN_CUSTOMER_CODE,
        customer_type: 'individual',
        default_currency: currency,
        is_active: true,
        is_system_default: true,
        custom_fields: JSON.stringify({}),
      })
      .returning(['id', 'code'])
      .executeTakeFirstOrThrow();
    return row;
  } finally {
    await db.destroy();
  }
}
