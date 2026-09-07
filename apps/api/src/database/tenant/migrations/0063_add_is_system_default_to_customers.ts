import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Walk-in/Cash Customer (POS feature Stage 2, CLAUDE.md §10 — step 4,
 * Sales — POS; see claude/sales-pos-research.md's "Walk-in / Cash
 * Customer" section). is_system_default marks the one customer row
 * per tenant that POS defaults new sales to, seeded by
 * walk-in-customer-seed.ts (via provisionTenant() for new tenants, or
 * the standalone db:seed-walk-in-customer CLI for pre-existing ones) —
 * never settable through the ordinary Customers API
 * (CreateCustomerInput/UpdateCustomerInput deliberately omit it).
 * CustomersService.delete() rejects deleting a system-default customer.
 *
 * Partial UNIQUE index (same technique as pos_sessions' one-open-per-
 * cashier index, migration 0059) enforces at most one such row per
 * tenant — not a general uniqueness constraint, since every other
 * customer has is_system_default = FALSE.
 */
const migration: TenantMigration = {
  name: '0063_add_is_system_default_to_customers',
  async up(db) {
    await sql`ALTER TABLE customers ADD COLUMN is_system_default BOOLEAN NOT NULL DEFAULT FALSE`.execute(db);

    await sql`
      CREATE UNIQUE INDEX customers_one_system_default
        ON customers (is_system_default)
        WHERE is_system_default = TRUE
    `.execute(db);
  },
};

export default migration;
