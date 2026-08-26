import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * permissions (master doc §16.2): a fixed system catalog, not tenant-
 * editable — every permission key a PermissionsGuard-protected endpoint
 * can require. Seeded here rather than created ad hoc through the API,
 * since the catalog must match exactly what the code checks. Grows as
 * later modules add their own `<module>.manage`-style keys in their own
 * migrations — this file only seeds what Users & Permissions and
 * Settings need today.
 */
const migration: TenantMigration = {
  name: '0007_create_permissions',
  async up(db) {
    await sql`
      CREATE TABLE permissions (
        id UUID PRIMARY KEY,
        key TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT permissions_key_unique UNIQUE (key)
      )
    `.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description) VALUES
        (gen_random_uuid(), 'settings.manage', 'Manage tenant settings, branches, numbering, templates, and taxes'),
        (gen_random_uuid(), 'users.manage', 'Create, update, and deactivate users; assign roles and branch access'),
        (gen_random_uuid(), 'roles.manage', 'Create and edit roles and their permission assignments'),
        (gen_random_uuid(), 'audit_logs.view', 'View the audit log')
    `.execute(db);
  },
};

export default migration;
