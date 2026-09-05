import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * sales_orders + sales_order_lines (master doc §10, step 4 — Sales,
 * Stage 3). The formal commitment from a customer — either converted 1:1
 * from an 'accepted' quotation (the normal B2B path), or created
 * directly when no quotation step was needed (e.g. a routine repeat
 * order, or the POS fast-checkout path master doc §9.2 describes) —
 * exact mirror of Purchase Orders' (0032) two creation paths via
 * `resolveSupplierAndLines()`, here `resolveCustomerAndLines()`.
 *
 * so_number is allocated via Settings' numbering_sequences (document_type
 * 'sales_order') — same mechanism as every other document type.
 *
 * No total_amount column — derived from lines on read
 * (calculateSalesOrderTotal), same reasoning as Purchase Orders/
 * Quotations.
 *
 * Status is intentionally still simple at this stage: draft -> confirmed,
 * plus cancelled from either — same deliberate scope-limiting as
 * Purchase Orders' migration comment: a 'partially_fulfilled'/
 * 'fully_fulfilled' status is NOT added here, because that concept
 * belongs to Deliveries (Stage 4, not built yet) actually tracking what
 * shipped — inventing it now would be guessing at that stage's design,
 * the same reasoning Purchase Orders gave for deferring
 * partially_received/fully_received to Goods Receipts.
 */
const migration: TenantMigration = {
  name: '0042_create_sales_orders',
  async up(db) {
    await sql`
      CREATE TABLE sales_orders (
        id UUID PRIMARY KEY,
        so_number TEXT NOT NULL,
        customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        source_quotation_id UUID REFERENCES quotations (id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_orders_number_unique UNIQUE (so_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE sales_order_lines (
        id UUID PRIMARY KEY,
        sales_order_id UUID NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_order_lines_quantity_positive CHECK (quantity > 0),
        CONSTRAINT sales_order_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX sales_order_lines_sales_order_id_idx ON sales_order_lines (sales_order_id)`.execute(db);
    await sql`CREATE INDEX sales_orders_customer_id_idx ON sales_orders (customer_id)`.execute(db);
    await sql`CREATE INDEX sales_orders_status_idx ON sales_orders (status)`.execute(db);
  },
};

export default migration;
