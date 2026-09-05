import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * payments_received + payment_allocations (master doc §10, step 4 —
 * Sales, Stage 6, the last baseline entity in the Sales entity list
 * [مستقر]). Unlike Purchases (which explicitly deferred supplier
 * payment tracking to Accounting — see claude/purchases-module-
 * research.md's "Secondary findings"), the master document's Sales
 * entity list names `payments_received` directly, so this is in scope
 * now, not a scope decision to ask about.
 *
 * A payment is recorded against a customer, for a total amount, then
 * optionally allocated across one or more *posted* sales invoices
 * (payment_allocations) — a customer can pay off several invoices in
 * one payment, pay one invoice partially, or pay with no allocation at
 * all (pure on-account credit, applied to invoices later — allocating
 * an existing payment to a new invoice is a known, explicitly deferred
 * gap, see PaymentsReceivedService's class comment). Unallocated
 * remainder = amount - sum(allocations), always computed on read, never
 * stored (same "don't store what's derivable" principle as every prior
 * Sales document).
 *
 * Table/column shape follows the two established precedents this
 * combines: the draft -> posted | cancelled + Outbox lifecycle from
 * Purchase/Sales Invoices (a payment reducing what a customer owes is
 * as ledger-worthy as an invoice creating that debt — CLAUDE.md §2.7),
 * and the parent-with-money-bearing-allocation-rows shape from
 * Inventory's landed_costs/landed_cost_allocations (migration 0026) —
 * hence allocated_amount_amount/allocated_amount_currency, matching
 * landed_cost_allocations' own column naming exactly.
 *
 * payment_method is a small fixed CHECK enum (cash/bank_transfer/check/
 * card/other) — a real column now, not gold-plating: every system in
 * the Sales research pass records this, and it costs nothing to store
 * up front. reference_number is free text (check number, bank transfer
 * reference, card auth code, etc.) — deliberately not itself validated
 * or looked up anywhere.
 *
 * No customer_id-independent "unapplied payments" listing/report is
 * built here — that's a UI/query concern for the frontend stage, not a
 * new backend entity.
 */
const migration: TenantMigration = {
  name: '0046_create_payments_received',
  async up(db) {
    await sql`
      CREATE TABLE payments_received (
        id UUID PRIMARY KEY,
        payment_number TEXT NOT NULL,
        customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        payment_date DATE,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card', 'other')),
        reference_number TEXT,
        amount_amount BIGINT NOT NULL,
        amount_currency TEXT NOT NULL,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT payments_received_number_unique UNIQUE (payment_number),
        CONSTRAINT payments_received_amount_positive CHECK (amount_amount > 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE payment_allocations (
        id UUID PRIMARY KEY,
        payment_received_id UUID NOT NULL REFERENCES payments_received (id) ON DELETE CASCADE,
        sales_invoice_id UUID NOT NULL REFERENCES sales_invoices (id) ON DELETE RESTRICT,
        allocated_amount_amount BIGINT NOT NULL,
        allocated_amount_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT payment_allocations_amount_positive CHECK (allocated_amount_amount > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX payments_received_customer_id_idx ON payments_received (customer_id)`.execute(db);
    await sql`CREATE INDEX payments_received_status_idx ON payments_received (status)`.execute(db);
    await sql`CREATE INDEX payment_allocations_payment_received_id_idx ON payment_allocations (payment_received_id)`.execute(db);
    await sql`CREATE INDEX payment_allocations_sales_invoice_id_idx ON payment_allocations (sales_invoice_id)`.execute(db);
  },
};

export default migration;
