import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/**
 * Tenant-schema Kysely client factory (CLAUDE.md §2.2, §2.3).
 *
 * Kysely is used for ALL tenant-schema access — never Prisma, which is
 * reserved for the public/platform schema (see ../../../prisma/schema.prisma).
 * Each call connects to one tenant's own Postgres schema via `search_path`,
 * reflecting schema-per-tenant isolation at the connection level (§2.3):
 * no `tenant_id` column, no shared table.
 *
 * The `TenantDatabase` type is intentionally minimal at this stage — it
 * only describes infrastructure tables this task owns (schema_migrations).
 * Business-module tables (e.g. Settings' tenant_settings, branches, ...)
 * get added here as their own migrations are implemented, in a later task.
 */
export interface SchemaMigrationsTable {
  id: string;
  migration_file: string;
  applied_at: Date;
}

export interface TenantDatabase {
  schema_migrations: SchemaMigrationsTable;
}

const SCHEMA_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Validates a tenant schema name before it's interpolated into a raw SQL
 * connection option or DDL statement. Defense in depth: schema names
 * originate from public.tenants (trusted), but nothing here should ever
 * trust a string blindly before using it in raw SQL.
 */
export function assertValidSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid tenant schema name "${schemaName}": must be lowercase, start ` +
        `with a letter, and contain only letters, digits, and underscores.`,
    );
  }
}

export function createTenantKyselyClient(
  connectionString: string,
  schemaName: string,
): Kysely<TenantDatabase> {
  assertValidSchemaName(schemaName);

  return new Kysely<TenantDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        options: `-c search_path="${schemaName}"`,
      }),
    }),
  });
}
