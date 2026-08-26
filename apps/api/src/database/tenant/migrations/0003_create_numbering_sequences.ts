import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * numbering_sequences (master doc §16.1: "flexible document numbering").
 * document_type is a free-text key (e.g. 'sales_invoice',
 * 'purchase_order') rather than a fixed enum, on purpose — later modules
 * (Sales, Purchases, ...) introduce new document types without a
 * migration to this table. A sequence may optionally be scoped to one
 * branch (branch_id NULL = tenant-wide sequence for that document type).
 *
 * The unique index uses COALESCE to a sentinel UUID because Postgres
 * treats NULL as distinct in a plain UNIQUE constraint — without this,
 * two "global" (branch_id NULL) sequences for the same document_type
 * could silently coexist and issue colliding numbers.
 */
const migration: TenantMigration = {
  name: '0003_create_numbering_sequences',
  async up(db) {
    await sql`
      CREATE TABLE numbering_sequences (
        id UUID PRIMARY KEY,
        document_type TEXT NOT NULL,
        branch_id UUID REFERENCES branches(id),
        prefix TEXT,
        next_number INTEGER NOT NULL DEFAULT 1,
        padding_length INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT numbering_sequences_next_number_positive CHECK (next_number > 0)
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX numbering_sequences_type_branch_uidx
        ON numbering_sequences (
          document_type,
          COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
    `.execute(db);
  },
};

export default migration;
