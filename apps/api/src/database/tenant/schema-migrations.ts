import { Kysely, sql } from 'kysely';
import type { TenantDatabase } from './kysely-client';

/**
 * Ensures the schema_migrations tracking table exists in a tenant schema.
 * Bootstrapped directly here (not via the pluggable migration-file
 * mechanism in ./migrations/) since the runner needs this table to exist
 * before it can track anything else (CLAUDE.md §3).
 */
export async function ensureSchemaMigrationsTable(
  db: Kysely<TenantDatabase>,
): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      migration_file TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
}
