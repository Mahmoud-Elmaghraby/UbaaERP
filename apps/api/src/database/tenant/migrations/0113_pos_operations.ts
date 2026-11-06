import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * POS operations (2026-11-05):
 *  - users.pos_pin_hash: a supervisor's PIN (bcrypt) — typed on the cashier's
 *    till to approve what the cashier may not do alone.
 *  - tenant_settings.pos_max_discount_percent: the largest discount (line or
 *    sale) a cashier gives without a supervisor (NULL = no limit).
 *  - customer_refunds (رد مبلغ لعميل): money paid back to a customer — a POS
 *    return refunded on the spot, or a credit balance paid out from the
 *    customer's page. Posted on creation, cancelled with a reason (never
 *    edited). Accounting: Dr Receivables / Cr the treasury.
 *  - pos_held_carts: a sale parked at the till (the customer forgot
 *    something) and resumed later, on any till of the same warehouse.
 *  - treasury_vouchers.pos_session_id: cash put into / taken out of the
 *    drawer during a shift (an expense, a transfer to the safe) — counted in
 *    the session's expected cash.
 *  - sales_orders.pos_session_id: the shift a POS sale was rung up in (its
 *    receipts list, reprint and returns).
 *  - pos_approvals: who approved what (discount over the limit, a return, a
 *    cash withdrawal) on whose till.
 */
const migration: TenantMigration = {
  name: '0113_pos_operations',
  async up(db) {
    await sql`ALTER TABLE users ADD COLUMN pos_pin_hash TEXT`.execute(db);
    await sql`
      ALTER TABLE tenant_settings
      ADD COLUMN pos_max_discount_percent NUMERIC(5, 2)
        CHECK (pos_max_discount_percent IS NULL OR (pos_max_discount_percent >= 0 AND pos_max_discount_percent <= 100))
    `.execute(db);

    await sql`
      CREATE TABLE customer_refunds (
        id UUID PRIMARY KEY,
        refund_number TEXT NOT NULL UNIQUE,
        customer_id UUID NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        refund_date DATE NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'other')),
        treasury_id UUID REFERENCES treasuries(id),
        amount BIGINT NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        sales_credit_note_id UUID REFERENCES sales_credit_notes(id),
        pos_session_id UUID REFERENCES pos_sessions(id),
        approved_by_user_id UUID REFERENCES users(id),
        created_by_user_id UUID REFERENCES users(id),
        reference TEXT,
        notes TEXT,
        cancelled_at TIMESTAMPTZ,
        cancel_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX customer_refunds_customer_idx ON customer_refunds (customer_id)`.execute(db);
    await sql`CREATE INDEX customer_refunds_session_idx ON customer_refunds (pos_session_id) WHERE pos_session_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX customer_refunds_treasury_idx ON customer_refunds (treasury_id)`.execute(db);

    await sql`
      CREATE TABLE pos_held_carts (
        id UUID PRIMARY KEY,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        pos_session_id UUID REFERENCES pos_sessions(id) ON DELETE SET NULL,
        created_by_user_id UUID REFERENCES users(id),
        label TEXT,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        payload JSONB NOT NULL,
        total_amount BIGINT NOT NULL DEFAULT 0,
        currency TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX pos_held_carts_warehouse_idx ON pos_held_carts (warehouse_id, created_at)`.execute(db);

    await sql`ALTER TABLE sales_orders ADD COLUMN pos_session_id UUID REFERENCES pos_sessions(id)`.execute(db);
    await sql`CREATE INDEX sales_orders_pos_session_idx ON sales_orders (pos_session_id) WHERE pos_session_id IS NOT NULL`.execute(db);
    // Sales made before this migration: the session of the receipts that paid them.
    await sql`
      UPDATE sales_orders so SET pos_session_id = x.pos_session_id
      FROM (
        SELECT DISTINCT ON (si.sales_order_id) si.sales_order_id, pr.pos_session_id
        FROM sales_invoices si
        JOIN payment_allocations pa ON pa.sales_invoice_id = si.id
        JOIN payments_received pr ON pr.id = pa.payment_received_id
        WHERE pr.pos_session_id IS NOT NULL
      ) x
      WHERE x.sales_order_id = so.id
    `.execute(db);

    await sql`ALTER TABLE treasury_vouchers ADD COLUMN pos_session_id UUID REFERENCES pos_sessions(id)`.execute(db);
    await sql`CREATE INDEX treasury_vouchers_session_idx ON treasury_vouchers (pos_session_id) WHERE pos_session_id IS NOT NULL`.execute(db);

    await sql`
      CREATE TABLE pos_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pos_session_id UUID REFERENCES pos_sessions(id),
        action TEXT NOT NULL,
        cashier_user_id UUID REFERENCES users(id),
        approver_user_id UUID NOT NULL REFERENCES users(id),
        reference_id UUID,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX pos_approvals_session_idx ON pos_approvals (pos_session_id, created_at)`.execute(db);
  },
};

export default migration;
