import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * purchase_orders + purchase_order_lines (master doc §10, step 3 —
 * Purchases, Stage 4). The formal commitment to buy from one supplier at
 * agreed prices — either converted 1:1 from a 'selected' supplier
 * quotation (the RFQ path, Stage 3), or created directly when a formal
 * RFQ wasn't needed (e.g. a routine reorder from an established
 * supplier) — both are real flows in every system examined during the
 * research pass (Daftra/Odoo/ERPNext all allow a PO with or without a
 * preceding RFQ).
 *
 * po_number is allocated via Settings' numbering_sequences (document_type
 * 'purchase_order') — same mechanism as purchase_requisition/
 * request_for_quotation.
 *
 * No total_amount column: the total is derived from lines
 * (calculatePurchaseOrderTotal in the domain layer), not stored — a
 * stored total would be a second representation of the same value that
 * could drift out of sync with the lines, which Money VO/CLAUDE.md §2.5
 * principles argue against.
 *
 * Status is intentionally still simple at this stage: draft -> confirmed
 * (committed/sent to the supplier), plus cancelled from either. A
 * 'completed'/fully-received status is NOT added here — that concept
 * belongs to Goods Receipts (Stage 5, not built yet) actually tracking
 * what's arrived; inventing it now would be guessing at that stage's
 * design.
 */
const migration: TenantMigration = {
  name: '0032_create_purchase_orders',
  async up(db) {
    await sql`
      CREATE TABLE purchase_orders (
        id UUID PRIMARY KEY,
        po_number TEXT NOT NULL,
        supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
        source_quotation_id UUID REFERENCES supplier_quotations (id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        expected_delivery_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_orders_number_unique UNIQUE (po_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE purchase_order_lines (
        id UUID PRIMARY KEY,
        purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_order_lines_quantity_positive CHECK (quantity > 0),
        CONSTRAINT purchase_order_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX purchase_order_lines_purchase_order_id_idx ON purchase_order_lines (purchase_order_id)`.execute(db);
    await sql`CREATE INDEX purchase_orders_supplier_id_idx ON purchase_orders (supplier_id)`.execute(db);
    await sql`CREATE INDEX purchase_orders_status_idx ON purchase_orders (status)`.execute(db);
  },
};

export default migration;
