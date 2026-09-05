import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * suppliers (master doc §10, CLAUDE.md §17.2 competitor-research pass,
 * approved 2026-08-29 — see project doc claude/purchases-module-research.md
 * for the full comparison against Daftra/Wafeq/Odoo/ERPNext/Zoho).
 *
 * Foundational entity for the Purchases module (step 3, CLAUDE.md §10) —
 * every later Purchases document (RFQs, purchase orders, goods receipts,
 * purchase returns, purchase invoices) references a supplier.
 *
 * Field choices, cross-checked against the research pass:
 * - default_currency: backs "multi-currency per supplier" (master doc
 *   §10, listed as optional) — just a currency preference, not a Money
 *   amount itself, so it's a plain ISO 4217 TEXT column, not split into
 *   an _amount/_currency pair like an actual monetary value would be.
 * - payment_terms_days: net-terms convention (e.g. "net 30"), present in
 *   every system examined during the research pass.
 * - tax_number: supplier's tax/commercial-registration number, needed for
 *   Egypt-market bookkeeping; free-form TEXT (no format enforced — differs
 *   by country/entity type, and this module doesn't validate tax IDs).
 * - custom_fields is mandatory on every major entity (CLAUDE.md §7).
 *
 * Permission: unlike 0021 (Inventory's 'inventory.manage', which forgot
 * to grant Owner in the same migration — fixed retroactively by 0028),
 * this migration grants Owner directly, inline, per 0028's own
 * recommendation for future modules.
 */
const migration: TenantMigration = {
  name: '0029_create_suppliers',
  async up(db) {
    await sql`
      CREATE TABLE suppliers (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_number TEXT,
        default_currency TEXT NOT NULL,
        payment_terms_days INTEGER,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT suppliers_code_unique UNIQUE (code),
        CONSTRAINT suppliers_default_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
        CONSTRAINT suppliers_payment_terms_days_non_negative CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0)
      )
    `.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description) VALUES
        (gen_random_uuid(), 'purchases.manage', 'Manage suppliers, purchase requisitions, RFQs, purchase orders, goods receipts, purchase returns, and purchase invoices')
    `.execute(db);

    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, id FROM permissions WHERE key = 'purchases.manage'
    `.execute(db);
  },
};

export default migration;
