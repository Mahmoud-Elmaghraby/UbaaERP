import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * document_templates (master doc §16.1 / §9.2: "simple print-template
 * editor"). `content` holds the template body — treated as opaque text at
 * this layer (the print-template editor's exact format is a frontend
 * concern for a later task, not decided here). At most one default
 * template per document_type is enforced via a partial unique index.
 */
const migration: TenantMigration = {
  name: '0004_create_document_templates',
  async up(db) {
    await sql`
      CREATE TABLE document_templates (
        id UUID PRIMARY KEY,
        document_type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX document_templates_one_default_per_type_uidx
        ON document_templates (document_type)
        WHERE is_default = TRUE
    `.execute(db);
  },
};

export default migration;
