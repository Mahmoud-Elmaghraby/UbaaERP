import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * supplier_payments + supplier_payment_allocations — the Purchases mirror
 * of payments_received/payment_allocations (migrations 0046 + 0089), so
 * payables can be settled. Same lifecycle (draft -> posted | cancelled,
 * posting via the Outbox — CLAUDE.md §2.7), same money-bearing allocation
 * rows, same "unallocated remainder is derived, never stored" rule.
 * bank_account_id is the bank account the payment was paid FROM
 * (optional; cash and an unspecified bank fall back to the accounting
 * settings' cash/default bank accounts).
 */
const migration: TenantMigration = {
  name: '0090_create_supplier_payments',
  async up(db) {
    await sql`
      CREATE TABLE supplier_payments (
        id UUID PRIMARY KEY,
        payment_number TEXT NOT NULL,
        supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        payment_date DATE,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card', 'other')),
        reference_number TEXT,
        amount_amount BIGINT NOT NULL,
        amount_currency TEXT NOT NULL,
        bank_account_id UUID REFERENCES bank_accounts (id) ON DELETE RESTRICT,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT supplier_payments_number_unique UNIQUE (payment_number),
        CONSTRAINT supplier_payments_amount_positive CHECK (amount_amount > 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE supplier_payment_allocations (
        id UUID PRIMARY KEY,
        supplier_payment_id UUID NOT NULL REFERENCES supplier_payments (id) ON DELETE CASCADE,
        purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices (id) ON DELETE RESTRICT,
        allocated_amount_amount BIGINT NOT NULL,
        allocated_amount_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT supplier_payment_allocations_amount_positive CHECK (allocated_amount_amount > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX supplier_payments_supplier_id_idx ON supplier_payments (supplier_id)`.execute(db);
    await sql`CREATE INDEX supplier_payments_status_idx ON supplier_payments (status)`.execute(db);
    await sql`CREATE INDEX supplier_payment_allocations_payment_id_idx ON supplier_payment_allocations (supplier_payment_id)`.execute(db);
    await sql`CREATE INDEX supplier_payment_allocations_invoice_id_idx ON supplier_payment_allocations (purchase_invoice_id)`.execute(db);
  },
};

export default migration;
