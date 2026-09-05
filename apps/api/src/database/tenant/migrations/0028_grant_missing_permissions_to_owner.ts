import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Bug fix: 0009's dynamic "INSERT ... SELECT ... FROM permissions" grant
 * to Owner runs exactly once, at 0009's own step in migration history. It
 * only captures whatever rows already exist in `permissions` at that
 * point (i.e. what 0007 seeded) - NOT permissions added by later
 * migrations, even for brand-new tenants that run every migration in
 * order (0009 still executes before 0021, 0026, etc.).
 *
 * 0021 (Inventory's 'inventory.manage' permission) assumed 0009's grant
 * was "re-run safe" per its own doc comment, but migrations never re-run
 * - so Owner was never actually granted 'inventory.manage', on any
 * tenant, ever. This surfaced as Inventory missing from the sidebar for
 * an Owner-role user (the <Can> gate correctly hides nav items the JWT's
 * permissions array doesn't contain).
 *
 * Fix: grant Owner every permission key present in the catalog that
 * isn't already in role_permissions for the Owner role. Self-healing by
 * construction (not hardcoded to 'inventory.manage'), so it also covers
 * any other permission added between 0009 and here with the same gap.
 * Future modules should still explicitly grant Owner in their own
 * permission-seed migration (mirroring 0009's INSERT ... SELECT shape)
 * rather than relying on this migration running again - it fixes the
 * historical gap once, it is not a standing mechanism.
 */
const migration: TenantMigration = {
  name: '0028_grant_missing_permissions_to_owner',
  async up(db) {
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, p.id
      FROM permissions p
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = ${OWNER_ROLE_ID}::uuid AND rp.permission_id = p.id
      )
    `.execute(db);
  },
};

export default migration;
