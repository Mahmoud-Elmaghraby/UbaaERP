import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * roles (master doc §16.2). Tenant-manageable ("أدوار مخصصة" — custom
 * roles is an explicit customization point), except the seeded "Owner"
 * system role (is_system = TRUE), which cannot be deleted — see
 * RolesService.delete. A fixed, well-known UUID is used for Owner so
 * 0009's seed can grant it every permission without a correlated
 * subquery across migration files.
 */
const migration: TenantMigration = {
  name: '0008_create_roles',
  async up(db) {
    await sql`
      CREATE TABLE roles (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT roles_name_unique UNIQUE (name)
      )
    `.execute(db);

    await sql`
      INSERT INTO roles (id, name, is_system) VALUES (${OWNER_ROLE_ID}::uuid, 'Owner', TRUE)
    `.execute(db);
  },
};

export default migration;
