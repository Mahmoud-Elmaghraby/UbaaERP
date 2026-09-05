import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * request_for_quotations (+ rfq_lines, rfq_suppliers) and
 * supplier_quotations (+ supplier_quotation_lines) — master doc §10, step
 * 3 (Purchases), Stage 3. Approved research-pass addition (CLAUDE.md
 * §17.2, see claude/purchases-module-research.md): every system examined
 * (Daftra, Odoo, ERPNext) has a distinct "ask several suppliers for
 * prices, compare, then commit to one" step ahead of the purchase order —
 * absent from the master doc's original Purchases entity list.
 *
 * Two related documents, five tables, delivered together as one stage
 * (same reasoning as landed_costs+landed_cost_allocations in 0026, or
 * stock_lots+stock_lot_levels+stock_lot_consumptions in 0027):
 *
 * - request_for_quotations: what WE ask for (rfq_number is OUR issued
 *   document number, via Settings' numbering_sequences, document_type
 *   'request_for_quotation'). rfq_lines: what's being requested.
 *   rfq_suppliers: which suppliers were invited to quote (so it's visible
 *   who hasn't responded yet).
 * - supplier_quotations: what a supplier tells us back. Deliberately NOT
 *   numbered via numbering_sequences — it's a record of an inbound
 *   document (the supplier's own quote), not something we issue.
 *   supplier_quotation_lines carries unit_price as a real Money value
 *   (amount/currency pair, minor units — CLAUDE.md §2.5), since it's the
 *   first Purchases entity to actually carry a price.
 *
 * product_variant_id / supplier_id FKs are cross-module DB foreign keys
 * into Inventory/this-module's-own-Suppliers-table respectively — not
 * code imports (same precedent noted in 0030).
 */
const migration: TenantMigration = {
  name: '0031_create_rfq_and_supplier_quotations',
  async up(db) {
    await sql`
      CREATE TABLE request_for_quotations (
        id UUID PRIMARY KEY,
        rfq_number TEXT NOT NULL,
        source_requisition_id UUID REFERENCES purchase_requisitions (id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'closed', 'cancelled')),
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT request_for_quotations_number_unique UNIQUE (rfq_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE rfq_lines (
        id UUID PRIMARY KEY,
        rfq_id UUID NOT NULL REFERENCES request_for_quotations (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT rfq_lines_quantity_positive CHECK (quantity > 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE rfq_suppliers (
        id UUID PRIMARY KEY,
        rfq_id UUID NOT NULL REFERENCES request_for_quotations (id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT rfq_suppliers_unique UNIQUE (rfq_id, supplier_id)
      )
    `.execute(db);

    await sql`
      CREATE TABLE supplier_quotations (
        id UUID PRIMARY KEY,
        rfq_id UUID NOT NULL REFERENCES request_for_quotations (id) ON DELETE RESTRICT,
        supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'selected', 'rejected')),
        valid_until DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT supplier_quotations_unique_per_rfq UNIQUE (rfq_id, supplier_id)
      )
    `.execute(db);

    await sql`
      CREATE TABLE supplier_quotation_lines (
        id UUID PRIMARY KEY,
        quotation_id UUID NOT NULL REFERENCES supplier_quotations (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT supplier_quotation_lines_quantity_positive CHECK (quantity > 0),
        CONSTRAINT supplier_quotation_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX rfq_lines_rfq_id_idx ON rfq_lines (rfq_id)`.execute(db);
    await sql`CREATE INDEX rfq_suppliers_rfq_id_idx ON rfq_suppliers (rfq_id)`.execute(db);
    await sql`CREATE INDEX supplier_quotations_rfq_id_idx ON supplier_quotations (rfq_id)`.execute(db);
    await sql`CREATE INDEX supplier_quotation_lines_quotation_id_idx ON supplier_quotation_lines (quotation_id)`.execute(db);
  },
};

export default migration;
