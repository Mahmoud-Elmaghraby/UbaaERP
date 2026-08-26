import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * role_permissions (master doc §16.2): join table, composite PK. The
 * seeded Owner role (0008) is granted every currently-seeded permission
 * (0007) here, dynamically (SELECT ... FROM permissions) rather than by
 * hardcoding each permission id — so future migrations that add new
 * permission keys don't also need to remember to grant them to Owner by
 * hand in a separate step.
 */
const migration: TenantMigration = {
  name: '0009_create_role_permissions',
  async up(db) {
    await sql`
      CREATE TABLE role_permissions (
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )
    `.execute(db);

    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, id FROM permissions
    `.execute(db);
  },
};

export default migration;
