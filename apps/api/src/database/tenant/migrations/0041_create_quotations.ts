import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * quotations + quotation_lines (master doc §10, step 4 — Sales, Stage
 * 2). The first Sales document that actually carries a price — the
 * mirror image of Purchase Orders (0032) rather than Purchase
 * Requisitions (0030): Sales has no separate "ask several parties, then
 * commit" step the way Purchases' RFQ/Supplier-Quotation pair does (we
 * are the one party quoting a single customer directly), so this is one
 * document, not two — structurally closest to `purchase_orders`.
 *
 * quotation_number is allocated via Settings' numbering_sequences
 * (document_type 'quotation') — same mechanism as every other document
 * type in this codebase; a tenant must configure this sequence via
 * Settings → Numbering Sequences before the first quotation can be
 * created (same precedent as 0030's comment).
 *
 * unit_price_amount/unit_price_currency on the lines table: the Money
 * Value Object (CLAUDE.md §2.5), same minor-units-as-BIGINT shape as
 * `purchase_order_lines`. No total_amount column on the header — derived
 * from lines on read (calculateQuotationTotal), same reasoning as
 * Purchase Orders' migration comment.
 *
 * valid_until_date: new field with no Purchase Order equivalent — a
 * quotation is conventionally only valid for a limited time (every
 * system examined in claude/sales-module-research.md's mirror-image
 * Purchases research has this concept); nullable, purely informational
 * at this stage (no scheduled job auto-expires a quotation — that would
 * be inventing scheduling infrastructure nobody asked for; deliberately
 * left as a manual/display concern for now).
 *
 * Status: draft -> sent -> accepted | rejected, plus cancelled from
 * draft or sent — same shape and same reasoning as Purchase Orders'
 * draft -> confirmed (+cancelled): the simplest workflow that supports
 * the real states, nothing speculative added.
 */
const migration: TenantMigration = {
  name: '0041_create_quotations',
  async up(db) {
    await sql`
      CREATE TABLE quotations (
        id UUID PRIMARY KEY,
        quotation_number TEXT NOT NULL,
        customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'cancelled')),
        valid_until_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT quotations_number_unique UNIQUE (quotation_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE quotation_lines (
        id UUID PRIMARY KEY,
        quotation_id UUID NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT quotation_lines_quantity_positive CHECK (quantity > 0),
        CONSTRAINT quotation_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX quotation_lines_quotation_id_idx ON quotation_lines (quotation_id)`.execute(db);
    await sql`CREATE INDEX quotations_customer_id_idx ON quotations (customer_id)`.execute(db);
    await sql`CREATE INDEX quotations_status_idx ON quotations (status)`.execute(db);
  },
};

export default migration;
