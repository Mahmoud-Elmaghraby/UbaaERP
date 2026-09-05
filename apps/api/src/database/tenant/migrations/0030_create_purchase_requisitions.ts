import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * purchase_requisitions + purchase_requisition_lines (master doc §10, step
 * 3 — Purchases, Stage 2). The internal "we need to buy this" request that
 * starts the Purchases cycle, ahead of RFQ/purchase orders.
 *
 * requisition_number is allocated via Settings' numbering_sequences
 * (NumberingSequencesService.allocateNext) — same mechanism every other
 * document type uses, not a Purchases-local counter. This means a tenant
 * must configure a numbering sequence for document_type
 * 'purchase_requisition' via Settings → Numbering Sequences before the
 * first requisition can be created (mirrors how 'sales_invoice' numbering
 * already works) — deliberately not auto-seeded here, consistent with
 * every other numbering_sequences row in this codebase (none are seeded
 * by migration; the tenant configures them via that CRUD screen).
 *
 * product_variant_id on the lines table is a cross-module DB foreign key
 * into Inventory (not a code import) — same precedent as
 * user_branch_access -> branches (Settings) from Users & Permissions:
 * a DB-level FK across module-owned tables is fine; a direct code call
 * between business modules to trigger behavior is what CLAUDE.md §2.6
 * actually forbids.
 *
 * Status is a simple, explicit workflow for MVP: draft -> submitted ->
 * approved | rejected, plus cancelled from either draft or submitted.
 * Not wired to Users & Permissions' approval_chains yet (who may approve
 * is gated by the 'purchases.manage' permission only, not by "the
 * requester's manager specifically") — approval chains are listed as
 * optional for Purchases in the master doc; deeper enforcement is a
 * separate, bigger decision flagged for later rather than invented now.
 */
const migration: TenantMigration = {
  name: '0030_create_purchase_requisitions',
  async up(db) {
    await sql`
      CREATE TABLE purchase_requisitions (
        id UUID PRIMARY KEY,
        requisition_number TEXT NOT NULL,
        requested_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        branch_id UUID REFERENCES branches (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
        needed_by_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_requisitions_number_unique UNIQUE (requisition_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE purchase_requisition_lines (
        id UUID PRIMARY KEY,
        requisition_id UUID NOT NULL REFERENCES purchase_requisitions (id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_requisition_lines_quantity_positive CHECK (quantity > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX purchase_requisition_lines_requisition_id_idx ON purchase_requisition_lines (requisition_id)`.execute(db);
    await sql`CREATE INDEX purchase_requisitions_status_idx ON purchase_requisitions (status)`.execute(db);
  },
};

export default migration;
