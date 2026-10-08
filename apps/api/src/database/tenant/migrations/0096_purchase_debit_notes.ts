import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Purchase debit notes (إشعار خصم مورد) — issued automatically when a
 * purchase return is confirmed, for the part of the returned quantity that
 * was already invoiced. Priced at the invoice's own price and taxes, so it
 * exactly reverses its share of the invoice: it lowers what we owe the
 * supplier (statement / aging) and, when Accounting is on, reverses the
 * invoice's journal lines pro rata.
 */
const migration: TenantMigration = {
  name: '0096_purchase_debit_notes',
  async up(db) {
    await sql`
      CREATE TABLE purchase_debit_notes (
        id UUID PRIMARY KEY,
        debit_note_number TEXT NOT NULL UNIQUE,
        purchase_return_id UUID NOT NULL UNIQUE REFERENCES purchase_returns (id) ON DELETE RESTRICT,
        supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
        debit_note_date DATE NOT NULL,
        currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX purchase_debit_notes_supplier_idx ON purchase_debit_notes (supplier_id, debit_note_date)`.execute(db);
    await sql`
      CREATE TABLE purchase_debit_note_lines (
        id UUID PRIMARY KEY,
        purchase_debit_note_id UUID NOT NULL REFERENCES purchase_debit_notes (id) ON DELETE CASCADE,
        purchase_return_line_id UUID NOT NULL REFERENCES purchase_return_lines (id) ON DELETE RESTRICT,
        purchase_order_line_id UUID NOT NULL,
        product_variant_id UUID NOT NULL,
        base_quantity NUMERIC(18, 4) NOT NULL CHECK (base_quantity > 0),
        net_amount BIGINT NOT NULL,
        taxes JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `.execute(db);
    await sql`CREATE INDEX purchase_debit_note_lines_po_line_idx ON purchase_debit_note_lines (purchase_order_line_id)`.execute(db);
  },
};

export default migration;
