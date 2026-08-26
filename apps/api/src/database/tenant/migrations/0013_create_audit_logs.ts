import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * audit_logs (master doc §16.2): append-only — no updated_at, rows are
 * never mutated after insert. user_id is nullable + ON DELETE SET NULL
 * so a deleted/deactivated user's history is preserved rather than
 * cascaded away. Indexed for the audit-log screen's filters (§9.2).
 */
const migration: TenantMigration = {
  name: '0013_create_audit_logs',
  async up(db) {
    await sql`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC)`.execute(db);
    await sql`CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id)`.execute(db);
  },
};

export default migration;
