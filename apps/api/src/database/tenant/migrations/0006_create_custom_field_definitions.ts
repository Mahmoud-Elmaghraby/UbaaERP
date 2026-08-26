import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * custom_field_definitions (CLAUDE.md §7): metadata the dynamic form
 * engine reads to render custom fields for a given entity_type (e.g.
 * 'branches'). This table itself is infrastructure/metadata, not a
 * "major entity" — it does not carry its own custom_fields column.
 */
const migration: TenantMigration = {
  name: '0006_create_custom_field_definitions',
  async up(db) {
    await sql`
      CREATE TABLE custom_field_definitions (
        id UUID PRIMARY KEY,
        entity_type TEXT NOT NULL,
        field_key TEXT NOT NULL,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options JSONB,
        is_required BOOLEAN NOT NULL DEFAULT FALSE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT custom_field_definitions_type_key_unique UNIQUE (entity_type, field_key),
        CONSTRAINT custom_field_definitions_field_type_check
          CHECK (field_type IN ('text', 'number', 'date', 'list'))
      )
    `.execute(db);
  },
};

export default migration;
