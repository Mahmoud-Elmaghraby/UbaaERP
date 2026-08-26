import { Kysely, PostgresDialect, type Generated } from 'kysely';
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
 * `TenantDatabase` grows one row-type entry per tenant-schema table, added
 * here as each table's migration is written (see ./migrations/). Row
 * shapes use snake_case to match the actual Postgres column names — Kysely
 * has no implicit camelCase mapping, and repositories map to camelCase
 * domain types explicitly at the infrastructure boundary.
 */
export interface SchemaMigrationsTable {
  id: string;
  migration_file: string;
  applied_at: Date;
}

export interface TenantSettingsTable {
  id: string;
  singleton: boolean;
  currency_code: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BranchesTable {
  id: string;
  name: string;
  code: string;
  address: string | null;
  is_active: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface NumberingSequencesTable {
  id: string;
  document_type: string;
  branch_id: string | null;
  prefix: string | null;
  next_number: number;
  padding_length: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DocumentTemplatesTable {
  id: string;
  document_type: string;
  name: string;
  content: string;
  is_default: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaxRulesTable {
  id: string;
  name: string;
  rate: string;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomFieldDefinitionsTable {
  id: string;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
  display_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PermissionsTable {
  id: string;
  key: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RolesTable {
  id: string;
  name: string;
  is_system: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role_id: string;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserBranchAccessTable {
  user_id: string;
  branch_id: string;
}

export interface ApprovalChainsTable {
  id: string;
  user_id: string;
  manager_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: Generated<Date>;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface TenantDatabase {
  schema_migrations: SchemaMigrationsTable;
  tenant_settings: TenantSettingsTable;
  branches: BranchesTable;
  numbering_sequences: NumberingSequencesTable;
  document_templates: DocumentTemplatesTable;
  tax_rules: TaxRulesTable;
  custom_field_definitions: CustomFieldDefinitionsTable;
  permissions: PermissionsTable;
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  users: UsersTable;
  user_branch_access: UserBranchAccessTable;
  approval_chains: ApprovalChainsTable;
  audit_logs: AuditLogsTable;
  refresh_tokens: RefreshTokensTable;
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
