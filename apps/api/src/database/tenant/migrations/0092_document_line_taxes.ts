import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Invoice taxes — the documents (setup was 0091).
 *
 * Each invoice / credit-note line stores a SNAPSHOT of its taxes
 * (`taxes` JSONB: rule id, name, kind, rate, ETA codes, base and amount in
 * minor units) and its `net_amount`, computed once by the shared tax engine
 * when the draft is created. A posted document therefore never changes if
 * a tax rule is edited later, and the ETA submission can send exactly what
 * the customer saw. Lines created before this migration have no taxes and
 * net_amount NULL (= unit price × quantity), so their totals are unchanged.
 *
 * prices_include_tax: the unit prices were entered including VAT and table
 * tax (retail / POS); the net is backed out per line.
 */
const LINE_TABLES = ['sales_invoice_lines', 'purchase_invoice_lines', 'sales_credit_note_lines'] as const;
const HEADER_TABLES = ['sales_invoices', 'purchase_invoices'] as const;

const migration: TenantMigration = {
  name: '0092_document_line_taxes',
  async up(db) {
    for (const table of LINE_TABLES) {
      await sql`
        ALTER TABLE ${sql.table(table)}
          ADD COLUMN net_amount BIGINT,
          ADD COLUMN taxes JSONB NOT NULL DEFAULT '[]'::jsonb
      `.execute(db);
    }
    for (const table of HEADER_TABLES) {
      await sql`
        ALTER TABLE ${sql.table(table)} ADD COLUMN prices_include_tax BOOLEAN NOT NULL DEFAULT FALSE
      `.execute(db);
    }
  },
};

export default migration;
