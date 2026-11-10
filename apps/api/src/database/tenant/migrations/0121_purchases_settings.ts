import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Settings hub phase 3: purchases. The settings themselves live in app_settings (a missing row is
 * today's behaviour), so the only schema change is one permission:
 * 'purchases.approve' — confirm a purchase order at or above 'purchases.orderApprovalAmount', and
 * buy above the last price when 'purchases.priceIncreaseMode' blocks it. Given to the roles that
 * manage purchases set-up ('purchases.settings.manage', the purchasing manager) and to Owner.
 */
const migration: TenantMigration = {
  name: '0121_purchases_settings',
  async up(db) {
    await sql`
      INSERT INTO permissions (id, key, description)
      VALUES (gen_random_uuid(), 'purchases.approve', 'Approve large purchase orders and purchase prices above the last price')
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'purchases.settings.manage'
      CROSS JOIN permissions p
      WHERE p.key = 'purchases.approve'
      ON CONFLICT DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, p.id FROM permissions p
      WHERE p.key = 'purchases.approve' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
