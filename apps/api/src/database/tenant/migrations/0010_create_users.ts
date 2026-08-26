import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * users (master doc §16.2): tenant-schema ERP users (employees, managers,
 * owners) — distinct from `public.tenants`' "platform users" (CLAUDE.md
 * §2.3), which is a separate, out-of-scope concept for this module.
 * email is stored/compared lowercase — normalized at the application
 * layer (UsersService), not enforced by a DB constraint, to keep the
 * migration simple.
 */
const migration: TenantMigration = {
  name: '0010_create_users',
  async up(db) {
    await sql`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role_id UUID NOT NULL REFERENCES roles(id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT users_email_unique UNIQUE (email)
      )
    `.execute(db);
  },
};

export default migration;
