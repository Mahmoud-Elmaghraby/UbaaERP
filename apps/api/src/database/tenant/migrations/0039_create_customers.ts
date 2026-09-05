import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * customers (master doc §10, step 4 — Sales). Foundational entity for
 * the Sales module, the mirror image of Suppliers (0029) in Purchases —
 * every later Sales document (quotations, sales orders, deliveries,
 * sales invoices, payments received) will reference one.
 *
 * Field choices, mostly mirroring `suppliers` deliberately (same shape,
 * opposite direction of the same underlying relationship):
 * - default_currency / payment_terms_days / tax_number / custom_fields:
 *   identical rationale to `suppliers` (0029) — see that migration's
 *   comment.
 * - customer_type: NEW, with no Supplier equivalent — added because the
 *   mandatory ETA e-invoice integration (CLAUDE.md §8; see
 *   claude/sales-einvoice-spike.md §1) legally requires a different
 *   document type depending on the counterparty: 'business' customers
 *   get a real e-invoice (B2B, requires the customer's own TIN/RIN),
 *   'individual' customers get an e-receipt (B2C, no TIN required). This
 *   is a forward-compatible column (nullable-equivalent default,
 *   doesn't force any e-invoice code to exist yet) added now because
 *   retrofitting it after quotations/orders/invoices already reference
 *   customers would be far more invasive than a one-column addition
 *   today — CLAUDE.md §17.2.3's forward-compatibility tiebreaker, not
 *   gold-plating (no e-invoice submission logic is built in this pass).
 *
 * Permission: 'sales.manage', granted to Owner inline in this same
 * migration — per 0028/0029's established convention (never rely on a
 * later migration to backfill a role grant).
 */
const migration: TenantMigration = {
  name: '0039_create_customers',
  async up(db) {
    await sql`
      CREATE TABLE customers (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        customer_type TEXT NOT NULL DEFAULT 'business',
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
        CONSTRAINT customers_code_unique UNIQUE (code),
        CONSTRAINT customers_customer_type_valid CHECK (customer_type IN ('business', 'individual')),
        CONSTRAINT customers_default_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
        CONSTRAINT customers_payment_terms_days_non_negative CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0)
      )
    `.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description) VALUES
        (gen_random_uuid(), 'sales.manage', 'Manage customers, quotations, sales orders, deliveries, sales invoices, and payments received')
    `.execute(db);

    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, id FROM permissions WHERE key = 'sales.manage'
    `.execute(db);
  },
};

export default migration;
